package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/capability"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// The HackathonState facade.
//
// Upstream `main` models "what is switched on in this event" as one record of
// booleans; we model it as one row per capability with four states, a schedule
// and per-row audit. Ours is the superset and stays the single source of truth.
// This file adds main's shape on top of ours as a pure projection, so a client
// written against main's contract can read and write our rows.
//
// Nothing here enforces anything. Main gates by writing casbin policy from
// SetCapabilities; that path is deliberately not ported. `requireCapability`,
// reading the stored rows, remains the only gate — which is why every function
// below is a mapper and none of them touches the enforcer.
//
// The projection is `capability.State.Allowed()`: OPEN and UNGOVERNED are true,
// COMING and CLOSED are false. That is the same predicate the enforcement path
// uses, so the boolean a client reads is exactly what the server will permit.

// capabilityStateFromProto is the inverse of capabilityStateToProto. An
// unrecognised value maps to the empty State, which Allowed() reports as false
// — a state this binary cannot name must not be projected as "on".
func capabilityStateFromProto(s ents.CapabilityState) capability.State {
	switch s {
	case ents.CapabilityState_CAPABILITY_STATE_OPEN:
		return capability.StateOpen
	case ents.CapabilityState_CAPABILITY_STATE_CLOSED:
		return capability.StateClosed
	case ents.CapabilityState_CAPABILITY_STATE_COMING:
		return capability.StateComing
	case ents.CapabilityState_CAPABILITY_STATE_UNGOVERNED:
		return capability.StateUngoverned
	case ents.CapabilityState_CAPABILITY_STATE_UNSPECIFIED:
		return ""
	default:
		return ""
	}
}

// hackathonStateFrom flattens resolved capability statuses into main's shape.
//
// `modifiedAt` is the most recent modification across the rows, since that is
// when the state last actually changed; `fallbackModifiedAt` (the hackathon's
// own) stands in when no row has ever been touched, which is the case for a
// freshly created event and for every ungoverned capability.
//
// Order is whatever the statuses came in, which is `capability.All()` order
// from capabilityStatusesFromEnt — stable across calls, so a client diffing two
// responses compares like with like.
func hackathonStateFrom(
	hackathonID string,
	createdAt *timestamppb.Timestamp,
	fallbackModifiedAt *timestamppb.Timestamp,
	currentPhaseID string,
	statuses []*ents.CapabilityStatus,
) *ents.HackathonState {
	toggles := make([]*ents.CapabilityToggle, 0, len(statuses))
	modifiedAt := fallbackModifiedAt

	for _, st := range statuses {
		toggles = append(toggles, &ents.CapabilityToggle{
			Capability: st.GetCapability(),
			Enabled:    capabilityStateFromProto(st.GetState()).Allowed(),
		})
		if m := st.GetModifiedAt(); m != nil &&
			(modifiedAt == nil || m.AsTime().After(modifiedAt.AsTime())) {
			modifiedAt = m
		}
	}

	return &ents.HackathonState{
		Id:             hackathonID,
		CreatedAt:      createdAt,
		ModifiedAt:     modifiedAt,
		CurrentPhaseId: currentPhaseID,
		Capabilities:   toggles,
	}
}

// hackathonStateFromEntry is the read-path form: the entry already carries the
// capabilities, the timestamps and the current phase, so the facade costs no
// query. Call it AFTER `Capabilities` is populated, or it projects an empty
// state over a hackathon that has one.
func hackathonStateFromEntry(e *ents.Hackathon) *ents.HackathonState {
	if e == nil {
		return nil
	}

	return hackathonStateFrom(
		e.GetId(),
		e.GetCreatedAt(),
		e.GetModifiedAt(),
		// Optional on Hackathon, a plain string here: absent reads as "" on both,
		// and main's field is not optional.
		e.GetCurrentPhaseId(),
		e.GetCapabilities(),
	)
}

// hackathonStateFacade is the write-path form, for handlers that hold statuses
// but no entry. Best-effort like capabilityStatuses: the mutation has already
// committed, so a failure to read the timestamps back costs the caller a
// refetch rather than an error on work that landed.
func (s *HackathonService) hackathonStateFacade(
	ctx context.Context,
	id uuid.UUID,
	statuses []*ents.CapabilityStatus,
	currentPhaseID string,
) *ents.HackathonState {
	var createdAt, modifiedAt *timestamppb.Timestamp
	if h, err := s.dbClient.Hackathon.Get(ctx, id); err == nil {
		createdAt = timestamppb.New(h.CreatedAt)
		modifiedAt = timestamppb.New(h.ModifiedAt)
	} else {
		slog.Error("query hackathon for state facade", "err", err)
	}

	return hackathonStateFrom(id.String(), createdAt, modifiedAt, currentPhaseID, statuses)
}

// SetCurrentPhase is main's name for AdvancePhase, and a thin alias over it.
//
// Every rule lives in AdvancePhase and none is duplicated here: the casbin
// Write check, the "phase must belong to this hackathon" check, applying the
// capabilities scheduled for the target phase, and reading an empty phase_id as
// "clear the current phase". The request carries the same CEL rules as
// AdvancePhaseRequest so protovalidate has already accepted an empty phase_id
// by the time this runs — this method calls the handler directly, which is
// past the interceptor.
//
// Only the answer differs: main's flat HackathonState rather than the
// CapabilityStatus list. Native callers should keep using AdvancePhase, which
// reports the schedule and the audit this flattens away.
func (s *HackathonService) SetCurrentPhase(
	ctx context.Context,
	req *msgs.SetCurrentPhaseRequest,
) (*msgs.SetCurrentPhaseResponse, error) {
	advanced, err := s.AdvancePhase(ctx, &msgs.AdvancePhaseRequest{
		HackathonId: req.GetHackathonId(),
		PhaseId:     req.GetPhaseId(),
	})
	if err != nil {
		return nil, err
	}

	// AdvancePhase parsed and authorised this id already, so a parse failure
	// here is unreachable; falling back to the raw string keeps the response
	// well-formed rather than empty if that ever stops being true.
	id, parseErr := uuid.Parse(req.GetHackathonId())
	//nolint:nilerr // unreachable per the comment above: AdvancePhase already
	// parsed the same id successfully, so this is a graceful fallback for an
	// invariant, not a swallowed real failure.
	if parseErr != nil {
		return &msgs.SetCurrentPhaseResponse{
			State: hackathonStateFrom(
				req.GetHackathonId(), nil, nil,
				advanced.GetCurrentPhaseId(), advanced.GetCapabilities(),
			),
		}, nil
	}

	return &msgs.SetCurrentPhaseResponse{
		State: s.hackathonStateFacade(
			ctx, id, advanced.GetCapabilities(), advanced.GetCurrentPhaseId(),
		),
	}, nil
}
