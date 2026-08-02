package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entcapability "github.com/swissdatasciencecenter/hackagon/components/backend/ent/capability"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/capability"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// The capability vocabulary exists in three representations — the domain type,
// the ent enum and the proto enum. These functions are the only place they meet.

func capabilityToProto(c capability.Capability) hackEnts.Capability {
	switch c {
	case capability.Register:
		return hackEnts.Capability_CAPABILITY_REGISTER
	case capability.SubmitProposal:
		return hackEnts.Capability_CAPABILITY_SUBMIT_PROPOSAL
	case capability.SetTeamPreferences:
		return hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES
	case capability.SubmitProject:
		return hackEnts.Capability_CAPABILITY_SUBMIT_PROJECT
	case capability.Vote:
		return hackEnts.Capability_CAPABILITY_VOTE
	case capability.ViewResults:
		return hackEnts.Capability_CAPABILITY_VIEW_RESULTS
	default:
		return hackEnts.Capability_CAPABILITY_UNSPECIFIED
	}
}

// CapabilityFromProto converts a request enum to the domain type. The bool is
// false for UNSPECIFIED and for values this binary does not know.
func CapabilityFromProto(c hackEnts.Capability) (capability.Capability, bool) {
	switch c {
	case hackEnts.Capability_CAPABILITY_REGISTER:
		return capability.Register, true
	case hackEnts.Capability_CAPABILITY_SUBMIT_PROPOSAL:
		return capability.SubmitProposal, true
	case hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES:
		return capability.SetTeamPreferences, true
	case hackEnts.Capability_CAPABILITY_SUBMIT_PROJECT:
		return capability.SubmitProject, true
	case hackEnts.Capability_CAPABILITY_VOTE:
		return capability.Vote, true
	case hackEnts.Capability_CAPABILITY_VIEW_RESULTS:
		return capability.ViewResults, true
	case hackEnts.Capability_CAPABILITY_UNSPECIFIED:
		return "", false
	default:
		return "", false
	}
}

func capabilityStateToProto(s capability.State) hackEnts.CapabilityState {
	switch s {
	case capability.StateOpen:
		return hackEnts.CapabilityState_CAPABILITY_STATE_OPEN
	case capability.StateClosed:
		return hackEnts.CapabilityState_CAPABILITY_STATE_CLOSED
	case capability.StateComing:
		return hackEnts.CapabilityState_CAPABILITY_STATE_COMING
	case capability.StateUngoverned:
		return hackEnts.CapabilityState_CAPABILITY_STATE_UNGOVERNED
	default:
		return hackEnts.CapabilityState_CAPABILITY_STATE_UNSPECIFIED
	}
}

// capabilityClosedMessage is what a blocked member is told. Phrased for them,
// and matching the wording the registration check already uses on
// feat/vote-service.
func capabilityClosedMessage(c capability.Capability) string {
	switch c {
	case capability.Register:
		return "registrations are closed"
	case capability.SubmitProposal:
		return "project proposals are closed"
	case capability.SetTeamPreferences:
		return "project preferences are closed"
	case capability.SubmitProject:
		return "project submissions are closed"
	case capability.Vote:
		return "voting is closed"
	case capability.ViewResults:
		return "results have not been published"
	default:
		return "this action is closed"
	}
}

// capabilityToEnt converts to the ent enum. The values are identical strings by
// construction; the switch exists so an unknown value cannot reach the database.
func capabilityToEnt(c capability.Capability) (entcapability.Capability, bool) {
	ec := entcapability.Capability(c)
	if err := entcapability.CapabilityValidator(ec); err != nil {
		return "", false
	}

	return ec, true
}

// capabilityRows reduces stored rows to what the resolver needs.
func capabilityRows(rows []*ent.Capability) []capability.Row {
	out := make([]capability.Row, 0, len(rows))
	for _, r := range rows {
		out = append(out, capability.Row{
			Capability: capability.Capability(r.Capability),
			Enabled:    r.Enabled,
		})
	}

	return out
}

// capabilityStatusFromEnt maps one stored row.
//
// Requires `.WithModifier()` on the query; a missing modifier is tolerated
// because seeded and backfilled rows have none.
func capabilityStatusFromEnt(row *ent.Capability) *hackEnts.CapabilityStatus {
	c := capability.Capability(row.Capability)

	state := capability.StateClosed
	if row.Enabled {
		state = capability.StateOpen
	}

	var modifierID *string
	if row.Edges.Modifier != nil {
		id := row.Edges.Modifier.ID.String()
		modifierID = &id
	}

	return &hackEnts.CapabilityStatus{
		Capability: capabilityToProto(c),
		State:      capabilityStateToProto(state),
		ModifiedAt: timestamppb.New(row.ModifiedAt),
		ModifierId: modifierID,
	}
}

// capabilityStatusesFromEnt maps stored rows to one status per capability in the
// vocabulary — including the ones with no row, which report UNGOVERNED. Emitting
// the full set means clients never have to know the vocabulary themselves.
func capabilityStatusesFromEnt(rows []*ent.Capability) []*hackEnts.CapabilityStatus {
	byCapability := make(map[capability.Capability]*ent.Capability, len(rows))
	for _, r := range rows {
		byCapability[capability.Capability(r.Capability)] = r
	}

	all := capability.All()
	out := make([]*hackEnts.CapabilityStatus, 0, len(all))
	for _, c := range all {
		row, ok := byCapability[c]
		if !ok {
			out = append(out, &hackEnts.CapabilityStatus{
				Capability: capabilityToProto(c),
				State:      hackEnts.CapabilityState_CAPABILITY_STATE_UNGOVERNED,
				ModifiedAt: nil,
				ModifierId: nil,
			})

			continue
		}
		out = append(out, capabilityStatusFromEnt(row))
	}

	return out
}

// defaultCapabilityEnabled is the state every capability starts in on a newly
// created hackathon.
//
// Open, deliberately. It makes introducing capabilities behavior-preserving: no
// existing caller changes, and a new hackathon is not bricked before the
// organizer settings screen exists. Closing an action is then an explicit act.
//
// Note this differs from feat/vote-service, which defaults
// registrations_enabled to false. Flipping this to closed-by-default is a
// one-line change, but it is a product decision — organizers would have to open
// every action before members could do anything — so it wants the organizer UI
// to land first and should be decided on purpose, not inherited from plumbing.
const defaultCapabilityEnabled = true

// createDefaultCapabilities inserts one row per capability.
//
// Pre-creating the full set is what keeps editing a plain update rather than an
// upsert, and it means a hackathon states its policy explicitly rather than
// being ambiguously ungoverned. Must run inside the same flow that creates the
// hackathon.
func createDefaultCapabilities(
	ctx context.Context,
	db *ent.Client,
	hackathonID uuid.UUID,
	modifier *ent.User,
) error {
	all := capability.All()
	builders := make([]*ent.CapabilityCreate, 0, len(all))
	for _, c := range all {
		ec, ok := capabilityToEnt(c)
		if !ok {
			continue
		}
		builders = append(builders, db.Capability.Create().
			SetCapability(ec).
			SetEnabled(defaultCapabilityEnabled).
			SetHackathonID(hackathonID).
			SetModifier(modifier))
	}

	return db.Capability.CreateBulk(builders...).Exec(ctx)
}

// loadCapabilityStates resolves the capability states of one hackathon.
func loadCapabilityStates(
	ctx context.Context,
	db *ent.Client,
	hackathonID uuid.UUID,
) (capability.States, error) {
	rows, err := db.Capability.Query().
		Where(entcapability.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		All(ctx)
	if err != nil {
		slog.Error("query capabilities", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return capability.Resolve(capabilityRows(rows)), nil
}

// requireCapability blocks a mutation whose capability is closed.
//
// Call it alongside the casbin check, never instead of it: casbin answers "may
// this user ever do this", capabilities answer "is it open right now".
//
// Anyone who can write the hackathon bypasses the gate, because organizers have
// to be able to fix things outside the window — a team that missed the deadline
// by a minute is a support request, not a lockout.
func requireCapability(
	ctx context.Context,
	db *ent.Client,
	enf *mw.Enforcer,
	hackathonID uuid.UUID,
	c capability.Capability,
) error {
	bypass, err := enf.Enforce(ctx, hackathonID.String(), mw.Hackathon, mw.Write)
	if err != nil {
		slog.Error("enforce capability bypass", "err", err)

		return status.Error(codes.Internal, "authorization error")
	}
	if bypass {
		return nil
	}

	states, err := loadCapabilityStates(ctx, db, hackathonID)
	if err != nil {
		return err
	}

	if !states.Allowed(c) {
		return status.Error(codes.FailedPrecondition, capabilityClosedMessage(c))
	}

	return nil
}
