// Package capability answers "what is a member allowed to do in this hackathon
// right now".
//
// The gate is always a stored toggle, never a date. Phases may later describe
// when a capability is expected to change, but they never change it: a wrong
// date can then only produce a wrong countdown, never an unauthorized action.
//
// This package is deliberately free of ent and proto imports so the rules can be
// tested as plain data, and so the same function serves both the read path
// (what to show) and the write path (what to allow). Those two must never
// disagree.
package capability

import "time"

// Capability is one member-facing action that can be gated.
//
// The string values match the ent enum in db/schema/capability.go and the
// lower-case tail of the proto enum, so the three stay mechanically aligned.
type Capability string

const (
	Register           Capability = "register"
	SubmitProposal     Capability = "submit_proposal"
	SetTeamPreferences Capability = "set_team_preferences"
	SubmitProject      Capability = "submit_project"
	Vote               Capability = "vote"
	ViewResults        Capability = "view_results"
)

// All returns the full vocabulary, in the order rows are created for a new
// hackathon. A fresh slice each call, so no caller can reorder it for everyone
// else.
func All() []Capability {
	return []Capability{
		Register,
		SubmitProposal,
		SetTeamPreferences,
		SubmitProject,
		Vote,
		ViewResults,
	}
}

// State is the resolved answer for one capability.
type State string

const (
	// StateOpen means the action is allowed.
	StateOpen State = "open"
	// StateClosed means a row exists and its flag is off.
	StateClosed State = "closed"
	// StateComing means closed now, but its opens_phase starts in the future, so
	// callers can count down to it. Still closed for enforcement purposes — the
	// distinction is only what the member is told.
	StateComing State = "coming"
	// StateUngoverned means no row exists, so this package has no opinion.
	//
	// Callers must behave exactly as they did before capabilities existed —
	// mutations proceed, UI renders unchanged. This is what makes it safe to
	// adopt one capability at a time, and what stops hackathons that predate a
	// capability from having its action silently disappear.
	StateUngoverned State = "ungoverned"
)

// Row is one stored capability flag, reduced to what the rules need.
type Row struct {
	Capability Capability
	Enabled    bool
	// OpensAt is the start of the linked opens_phase, nil when unlinked or when
	// that phase has no date. Schedule only: it never opens the capability, it
	// only distinguishes "not open yet" from "closed" for the member's benefit.
	OpensAt *time.Time
	// ClosesAt is the start of the linked closes_phase, for display alongside an
	// open capability. Nil when unlinked.
	ClosesAt *time.Time
	// OpensPhase and CurrentPhase are positions in the hackathon's phase order,
	// set only once an organizer has advanced the hackathon by hand.
	//
	// When CurrentPhase is present it replaces the date comparison below. It has
	// to: an organizer advances precisely when the schedule has stopped matching
	// reality, and judging by dates then tells members "opens Friday" about
	// something the organizer has already declared finished.
	OpensPhase   *int
	CurrentPhase *int
}

// pending reports whether the opening moment is still ahead of us.
func (r Row) pending(now time.Time) bool {
	if r.CurrentPhase != nil {
		// Advanced by hand: order decides, and an unscheduled capability is
		// never "coming" because there is no position to compare.
		return r.OpensPhase != nil && *r.OpensPhase > *r.CurrentPhase
	}

	return r.OpensAt != nil && now.Before(*r.OpensAt)
}

// States is the resolved answer for every capability in the vocabulary.
type States map[Capability]State

// ResolveRow is the rule for a single stored row, and the only place it lives —
// both the read path (what to show) and the write path (what to allow) go
// through here so they cannot disagree.
//
// Note `Enabled` is checked first and unconditionally: the schedule never
// overrides the flag, so an incorrect phase date cannot open anything.
func ResolveRow(r Row, now time.Time) State {
	if r.Enabled {
		return StateOpen
	}
	if r.pending(now) {
		return StateComing
	}

	return StateClosed
}

// Resolve maps the stored rows of a single hackathon to a state per capability.
//
// Rows for unknown capabilities are ignored rather than rejected, so a backend
// rolled back to an older binary keeps serving the vocabulary it understands
// instead of failing every read.
func Resolve(rows []Row, now time.Time) States {
	byCapability := make(map[Capability]Row, len(rows))
	for _, r := range rows {
		byCapability[r.Capability] = r
	}

	all := All()
	states := make(States, len(all))
	for _, c := range all {
		row, ok := byCapability[c]
		if !ok {
			states[c] = StateUngoverned

			continue
		}
		states[c] = ResolveRow(row, now)
	}

	return states
}

// AdvanceRow is one capability's schedule expressed as positions in the
// hackathon's phase order, which is what advancing compares against.
//
// Positions rather than dates: advancing is "we are in Judging now", a statement
// about order, and organizers reach for it precisely when the clock has stopped
// matching reality.
type AdvanceRow struct {
	Capability Capability
	// OpensPhase is the position of the phase that opens this capability. Nil
	// means manually driven, and advancing must not touch it.
	OpensPhase *int
	// ClosesPhase is the position of the phase at whose start it closes. Nil
	// means it stays open once opened.
	ClosesPhase *int
}

// Advance computes the `enabled` flag each scheduled capability should take when
// the hackathon moves to the phase at position `target`.
//
// Capabilities with no opening phase are absent from the result and must be left
// exactly as they are — that is what keeps voting, and anything else an
// organizer drives by hand, immune to advancing.
//
// A capability spanning several phases stays open across them, which is why the
// window is a pair of positions rather than a single one: registration running
// from "registration opens" to "registration closes" cannot be expressed
// otherwise.
func Advance(rows []AdvanceRow, target int) map[Capability]bool {
	out := make(map[Capability]bool, len(rows))
	for _, r := range rows {
		if r.OpensPhase == nil {
			continue
		}
		opened := *r.OpensPhase <= target
		closed := r.ClosesPhase != nil && target >= *r.ClosesPhase
		out[r.Capability] = opened && !closed
	}

	return out
}

// Allowed reports whether a mutation guarded by c may proceed.
//
// Note that ungoverned counts as allowed. Enforcement call sites must use this
// rather than comparing against StateOpen, since that comparison would block
// every capability that has no row yet — including on every hackathon created
// before the capability was introduced.
func (s States) Allowed(c Capability) bool {
	state, ok := s[c]

	return !ok || state == StateOpen || state == StateUngoverned
}
