package service

import (
	"context"
	"log/slog"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entcapability "github.com/swissdatasciencecenter/hackagon/components/backend/ent/capability"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entphase "github.com/swissdatasciencecenter/hackagon/components/backend/ent/phase"
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
	case capability.ProposeProjects:
		return hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS
	case capability.SetTeamPreferences:
		return hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES
	case capability.CreateProjectSubmissions:
		return hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS
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
	case hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS:
		return capability.ProposeProjects, true
	case hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES:
		return capability.SetTeamPreferences, true
	case hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS:
		return capability.CreateProjectSubmissions, true
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
	case capability.ProposeProjects:
		return "project proposals are closed"
	case capability.SetTeamPreferences:
		return "project preferences are closed"
	case capability.CreateProjectSubmissions:
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

// capabilityClock is what a stored row needs to become a resolvable one: the
// hackathon's phase order, and where the organizer says it currently is.
//
// The zero value means "no manual advance", which falls back to comparing dates.
// That is the right default and the right choice for enforcement, where COMING
// and CLOSED are both blocked so the clock cannot change the outcome.
type capabilityClock struct {
	order        map[uuid.UUID]int
	currentPhase *int
}

func newCapabilityClock(
	order map[uuid.UUID]int,
	currentPhaseID *uuid.UUID,
) capabilityClock {
	clock := capabilityClock{order: order, currentPhase: nil}
	if currentPhaseID != nil {
		if pos, ok := order[*currentPhaseID]; ok {
			clock.currentPhase = &pos
		}
	}

	return clock
}

func (c capabilityClock) positionOf(phase *ent.Phase) *int {
	if phase == nil || c.order == nil {
		return nil
	}
	if pos, ok := c.order[phase.ID]; ok {
		return &pos
	}

	return nil
}

// capabilityRowFromEnt reduces a stored row to what the resolver needs.
//
// Requires `.WithOpenInPhase()` / `.WithClosedInPhase()`; an unloaded edge is
// indistinguishable from an unlinked one, which would silently downgrade a
// COMING capability to CLOSED.
func capabilityRowFromEnt(r *ent.Capability, clock capabilityClock) capability.Row {
	row := capability.Row{
		Capability:   capability.Capability(r.Capability),
		Enabled:      r.Enabled,
		OpensAt:      nil,
		ClosesAt:     nil,
		OpenInPhase:  clock.positionOf(r.Edges.OpenInPhase),
		CurrentPhase: clock.currentPhase,
	}
	if p := r.Edges.OpenInPhase; p != nil {
		row.OpensAt = p.StartsAt
	}
	if p := r.Edges.ClosedInPhase; p != nil {
		row.ClosesAt = p.StartsAt
	}

	return row
}

// capabilityRows reduces stored rows to what the resolver needs.
func capabilityRows(rows []*ent.Capability, clock capabilityClock) []capability.Row {
	out := make([]capability.Row, 0, len(rows))
	for _, r := range rows {
		out = append(out, capabilityRowFromEnt(r, clock))
	}

	return out
}

// capabilityStatusFromEnt maps one stored row.
//
// Requires `.WithModifier()`, `.WithOpenInPhase()` and `.WithClosedInPhase()`.
// A missing modifier is tolerated because seeded and backfilled rows have none.
func capabilityStatusFromEnt(
	row *ent.Capability,
	clock capabilityClock,
	now time.Time,
) *hackEnts.CapabilityStatus {
	r := capabilityRowFromEnt(row, clock)

	var modifierID *string
	if row.Edges.Modifier != nil {
		id := row.Edges.Modifier.ID.String()
		modifierID = &id
	}

	var openInPhaseID, closedInPhaseID *string
	if p := row.Edges.OpenInPhase; p != nil {
		id := p.ID.String()
		openInPhaseID = &id
	}
	if p := row.Edges.ClosedInPhase; p != nil {
		id := p.ID.String()
		closedInPhaseID = &id
	}

	return &hackEnts.CapabilityStatus{
		Capability:      capabilityToProto(r.Capability),
		State:           capabilityStateToProto(capability.ResolveRow(r, now)),
		ModifiedAt:      timestamppb.New(row.ModifiedAt),
		ModifierId:      modifierID,
		OpensAt:         optionalTimestamp(r.OpensAt),
		ClosesAt:        optionalTimestamp(r.ClosesAt),
		OpenInPhaseId:   openInPhaseID,
		ClosedInPhaseId: closedInPhaseID,
	}
}

func optionalTimestamp(t *time.Time) *timestamppb.Timestamp {
	if t == nil {
		return nil
	}

	return timestamppb.New(*t)
}

// capabilityStatusesFromEnt maps stored rows to one status per capability in the
// vocabulary — including the ones with no row, which report UNGOVERNED. Emitting
// the full set means clients never have to know the vocabulary themselves.
func capabilityStatusesFromEnt(
	rows []*ent.Capability,
	clock capabilityClock,
	now time.Time,
) []*hackEnts.CapabilityStatus {
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
				Capability:      capabilityToProto(c),
				State:           hackEnts.CapabilityState_CAPABILITY_STATE_UNGOVERNED,
				ModifiedAt:      nil,
				ModifierId:      nil,
				OpensAt:         nil,
				ClosesAt:        nil,
				OpenInPhaseId:   nil,
				ClosedInPhaseId: nil,
			})

			continue
		}
		out = append(out, capabilityStatusFromEnt(row, clock, now))
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
	clock capabilityClock,
	now time.Time,
) (capability.States, error) {
	rows, err := db.Capability.Query().
		Where(entcapability.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		WithOpenInPhase().
		WithClosedInPhase().
		All(ctx)
	if err != nil {
		slog.Error("query capabilities", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return capability.Resolve(capabilityRows(rows, clock), now), nil
}

// phaseOrderFrom maps each phase to its position in the timeline.
//
// Sorted by starts_at with the id as a tiebreaker, so two phases sharing a start
// still get a stable order — advancing must not depend on which row the database
// happened to return first. Undated phases sort last, matching Postgres' NULLS
// LAST default for ascending order so the query and slice forms agree.
func phaseOrderFrom(phases []*ent.Phase) map[uuid.UUID]int {
	sorted := make([]*ent.Phase, len(phases))
	copy(sorted, phases)
	sort.SliceStable(sorted, func(i, j int) bool {
		a, b := sorted[i], sorted[j]
		switch {
		case a.StartsAt == nil && b.StartsAt == nil:
			return a.ID.String() < b.ID.String()
		case a.StartsAt == nil:
			return false
		case b.StartsAt == nil:
			return true
		case a.StartsAt.Equal(*b.StartsAt):
			return a.ID.String() < b.ID.String()
		default:
			return a.StartsAt.Before(*b.StartsAt)
		}
	})

	order := make(map[uuid.UUID]int, len(sorted))
	for i, p := range sorted {
		order[p.ID] = i
	}

	return order
}

// phaseOrder is phaseOrderFrom for callers that have not already loaded phases.
func phaseOrder(
	ctx context.Context,
	db *ent.Client,
	hackathonID uuid.UUID,
) (map[uuid.UUID]int, error) {
	phases, err := db.Phase.Query().
		Where(entphase.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		All(ctx)
	if err != nil {
		slog.Error("query phases for ordering", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return phaseOrderFrom(phases), nil
}

// advanceRows expresses each capability's schedule as phase positions.
//
// A link pointing at a phase missing from `order` is treated as unlinked, so a
// capability whose phase was deleted concurrently is left untouched rather than
// being closed by an out-of-range comparison.
func advanceRows(rows []*ent.Capability, order map[uuid.UUID]int) []capability.AdvanceRow {
	out := make([]capability.AdvanceRow, 0, len(rows))
	for _, r := range rows {
		row := capability.AdvanceRow{
			Capability:    capability.Capability(r.Capability),
			OpenInPhase:   nil,
			ClosedInPhase: nil,
		}
		if p := r.Edges.OpenInPhase; p != nil {
			if pos, ok := order[p.ID]; ok {
				row.OpenInPhase = &pos
			}
		}
		if p := r.Edges.ClosedInPhase; p != nil {
			if pos, ok := order[p.ID]; ok {
				row.ClosedInPhase = &pos
			}
		}
		out = append(out, row)
	}

	return out
}

// applyPhaseLink resolves one schedule field of an EditCapability request onto
// the update builder: empty string unlinks, a UUID links after checking the
// phase belongs to this hackathon.
func applyPhaseLink(
	ctx context.Context,
	db *ent.Client,
	hackathonID uuid.UUID,
	phaseID string,
	unlink func() *ent.CapabilityUpdateOne,
	link func(uuid.UUID) *ent.CapabilityUpdateOne,
) error {
	if phaseID == "" {
		unlink()

		return nil
	}

	pid, err := uuid.Parse(phaseID)
	if err != nil {
		return status.Errorf(codes.InvalidArgument, "invalid phase id %q: %v", phaseID, err)
	}
	if err := phaseInHackathon(ctx, db, hackathonID, pid); err != nil {
		return err
	}
	link(pid)

	return nil
}

// phaseInHackathon rejects a schedule link pointing at another hackathon's
// phase, which would otherwise let an organizer read a date they do not own —
// and produce a countdown to a phase their members cannot see.
func phaseInHackathon(
	ctx context.Context,
	db *ent.Client,
	hackathonID, phaseID uuid.UUID,
) error {
	ok, err := db.Phase.Query().
		Where(
			entphase.IDEQ(phaseID),
			entphase.HasHackathonWith(enthackathon.IDEQ(hackathonID)),
		).
		Exist(ctx)
	if err != nil {
		slog.Error("query phase for capability link", "err", err)

		return status.Error(codes.Internal, "couldn't query database")
	}
	if !ok {
		return status.Errorf(
			codes.NotFound,
			"phase %s not found in hackathon %s",
			phaseID, hackathonID,
		)
	}

	return nil
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

	// No clock: COMING and CLOSED are both blocked, so the manual-advance
	// distinction cannot change whether this mutation is allowed. Skipping it
	// keeps every gated mutation off the phase-ordering query.
	unclocked := capabilityClock{order: nil, currentPhase: nil}
	states, err := loadCapabilityStates(ctx, db, hackathonID, unclocked, time.Now())
	if err != nil {
		return err
	}

	if !states.Allowed(c) {
		return status.Error(codes.FailedPrecondition, capabilityClosedMessage(c))
	}

	return nil
}
