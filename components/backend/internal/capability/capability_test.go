//go:build test && unittest

package capability_test

import (
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	. "github.com/swissdatasciencecenter/hackagon/components/backend/internal/capability"
)

var now = time.Date(2026, time.July, 15, 12, 0, 0, 0, time.UTC)

func at(days int) *time.Time {
	t := now.AddDate(0, 0, days)

	return &t
}

func row(c Capability, enabled bool) Row {
	return Row{Capability: c, Enabled: enabled, OpensAt: nil, ClosesAt: nil}
}

func scheduled(c Capability, enabled bool, opensAt, closesAt *time.Time) Row {
	return Row{Capability: c, Enabled: enabled, OpensAt: opensAt, ClosesAt: closesAt}
}

var _ = Describe("Capability", func() {
	Describe("Resolve", func() {
		It("opens a capability whose flag is on", func() {
			states := Resolve([]Row{row(Register, true)}, now)

			Expect(states[Register]).To(Equal(StateOpen))
		})

		It("closes a capability whose flag is off", func() {
			states := Resolve([]Row{row(Register, false)}, now)

			Expect(states[Register]).To(Equal(StateClosed))
		})

		It("resolves each capability independently", func() {
			states := Resolve([]Row{
				row(Register, false),
				row(Vote, true),
			}, now)

			Expect(states[Register]).To(Equal(StateClosed))
			Expect(states[Vote]).To(Equal(StateOpen))
		})

		It("reports capabilities with no row as ungoverned", func() {
			states := Resolve([]Row{row(Register, true)}, now)

			Expect(states[ProposeProjects]).To(Equal(StateUngoverned))
			Expect(states[ViewResults]).To(Equal(StateUngoverned))
		})

		It("reports every capability as ungoverned when there are no rows", func() {
			// A hackathon predating the capability table must keep behaving
			// exactly as it did, rather than having every action disappear.
			states := Resolve(nil, now)

			Expect(states).To(HaveLen(len(All())))
			for _, c := range All() {
				Expect(states[c]).To(Equal(StateUngoverned))
			}
		})

		It("answers for every capability in the vocabulary", func() {
			states := Resolve([]Row{row(Register, true)}, now)

			Expect(states).To(HaveLen(len(All())))
			for _, c := range All() {
				Expect(states).To(HaveKey(c))
			}
		})

		It("ignores rows for capabilities it does not know", func() {
			// An older binary reading rows written by a newer one must keep
			// serving the vocabulary it understands rather than failing.
			states := Resolve([]Row{
				row(Register, true),
				row(Capability("teleport"), true),
			}, now)

			Expect(states).To(HaveLen(len(All())))
			Expect(states).NotTo(HaveKey(Capability("teleport")))
			Expect(states[Register]).To(Equal(StateOpen))
		})

		It("lets the last row win when a capability appears twice", func() {
			// The unique index prevents this in the database; resolving it
			// deterministically means a violated invariant cannot become a
			// coin-flip over whether an action is allowed.
			states := Resolve([]Row{row(Vote, true), row(Vote, false)}, now)

			Expect(states[Vote]).To(Equal(StateClosed))
		})
	})

	Describe("ResolveRow schedule", func() {
		It("reports coming when the opening phase is still ahead", func() {
			r := scheduled(Register, false, at(3), at(10))

			Expect(ResolveRow(r, now)).To(Equal(StateComing))
		})

		It("reports closed once the opening phase has passed", func() {
			// Passing the opening date does not open anything — only the flag
			// does — so this stays closed rather than becoming open.
			r := scheduled(Register, false, at(-3), at(10))

			Expect(ResolveRow(r, now)).To(Equal(StateClosed))
		})

		It("reports closed at the exact instant the opening phase starts", func() {
			r := scheduled(Register, false, &now, nil)

			Expect(ResolveRow(r, now)).To(Equal(StateClosed))
		})

		It("ignores the schedule entirely when the flag is on", func() {
			// The decisive property of the design: an organizer who opens a
			// capability early is not overruled by its phase dates.
			r := scheduled(Register, true, at(3), at(10))

			Expect(ResolveRow(r, now)).To(Equal(StateOpen))
		})

		It("keeps a manually driven capability closed with no countdown", func() {
			// Voting opens abruptly, so it links to no phase. It must never
			// report coming, since there is no date to count down to.
			r := scheduled(Vote, false, nil, nil)

			Expect(ResolveRow(r, now)).To(Equal(StateClosed))
		})

		It("does not let a past closing phase reopen a coming capability", func() {
			r := scheduled(Register, false, at(3), at(-1))

			Expect(ResolveRow(r, now)).To(Equal(StateComing))
		})

		It("propagates coming through Resolve", func() {
			states := Resolve([]Row{scheduled(ProposeProjects, false, at(5), nil)}, now)

			Expect(states[ProposeProjects]).To(Equal(StateComing))
		})
	})

	Describe("ResolveRow after a manual advance", func() {
		pos := func(i int) *int { return &i }

		// A future date on the opening phase, as happens whenever an event runs
		// ahead of its published schedule.
		future := now.AddDate(0, 0, 5)

		It("ignores a future date once the organizer has advanced past the phase", func() {
			// Without this, a member is told "opens in 5 days" about something the
			// organizer has already declared finished.
			r := Row{
				Capability: ProposeProjects, Enabled: false,
				OpensAt: &future, ClosesAt: nil,
				OpenInPhase: pos(0), CurrentPhase: pos(2),
			}

			Expect(ResolveRow(r, now)).To(Equal(StateClosed))
		})

		It("still reports coming for a phase the organizer has not reached", func() {
			r := Row{
				Capability: ProposeProjects, Enabled: false,
				OpensAt: &future, ClosesAt: nil,
				OpenInPhase: pos(3), CurrentPhase: pos(1),
			}

			Expect(ResolveRow(r, now)).To(Equal(StateComing))
		})

		It("reports coming at the boundary only before the phase is reached", func() {
			atPhase := Row{
				Capability: ProposeProjects, Enabled: false,
				OpensAt: &future, ClosesAt: nil,
				OpenInPhase: pos(2), CurrentPhase: pos(2),
			}

			Expect(ResolveRow(atPhase, now)).To(Equal(StateClosed))
		})

		It("never reports coming for an unscheduled capability", func() {
			// Voting has no position to compare, so advancing cannot make it
			// look imminent.
			r := Row{
				Capability: Vote, Enabled: false,
				OpensAt: nil, ClosesAt: nil,
				OpenInPhase: nil, CurrentPhase: pos(1),
			}

			Expect(ResolveRow(r, now)).To(Equal(StateClosed))
		})

		It("falls back to dates when no advance has happened", func() {
			r := Row{
				Capability: ProposeProjects, Enabled: false,
				OpensAt: &future, ClosesAt: nil,
				OpenInPhase: pos(0), CurrentPhase: nil,
			}

			Expect(ResolveRow(r, now)).To(Equal(StateComing))
		})

		It("keeps the flag decisive regardless of position", func() {
			r := Row{
				Capability: ProposeProjects, Enabled: true,
				OpensAt: &future, ClosesAt: nil,
				OpenInPhase: pos(5), CurrentPhase: pos(0),
			}

			Expect(ResolveRow(r, now)).To(Equal(StateOpen))
		})
	})

	Describe("Advance", func() {
		pos := func(i int) *int { return &i }

		// The SDSC-shaped template: registration spans several phases, the rest
		// occupy one each, voting is driven by hand.
		template := []AdvanceRow{
			{Capability: Register, OpenInPhase: pos(0), ClosedInPhase: pos(3)},
			{Capability: ProposeProjects, OpenInPhase: pos(1), ClosedInPhase: pos(2)},
			{Capability: CreateProjectSubmissions, OpenInPhase: pos(3), ClosedInPhase: pos(4)},
			{Capability: ViewResults, OpenInPhase: pos(4), ClosedInPhase: nil},
			{Capability: Vote, OpenInPhase: nil, ClosedInPhase: nil},
		}

		It("opens a capability once its phase is reached", func() {
			Expect(Advance(template, 1)[ProposeProjects]).To(BeTrue())
		})

		It("keeps a capability closed before its phase", func() {
			Expect(Advance(template, 0)[ProposeProjects]).To(BeFalse())
		})

		It("closes a capability once its closing phase is reached", func() {
			Expect(Advance(template, 2)[ProposeProjects]).To(BeFalse())
		})

		It("keeps a spanning capability open across intermediate phases", func() {
			// Registration runs from phase 0 to 3, which a single phase link
			// could not express.
			for _, target := range []int{0, 1, 2} {
				Expect(Advance(template, target)[Register]).
					To(BeTrue(), "register should be open at phase %d", target)
			}
			Expect(Advance(template, 3)[Register]).To(BeFalse())
		})

		It("keeps an open-ended capability open once reached", func() {
			Expect(Advance(template, 4)[ViewResults]).To(BeTrue())
			Expect(Advance(template, 99)[ViewResults]).To(BeTrue())
		})

		It("omits manually driven capabilities so they are left untouched", func() {
			// The property that protects voting from being closed by advancing.
			for _, target := range []int{0, 1, 2, 3, 4} {
				_, present := Advance(template, target)[Vote]
				Expect(present).To(BeFalse(), "vote must not be decided at phase %d", target)
			}
		})

		It("is idempotent for the same target", func() {
			Expect(Advance(template, 2)).To(Equal(Advance(template, 2)))
		})

		It("restores the earlier flags when advancing backwards", func() {
			forward := Advance(template, 1)
			Expect(Advance(template, 3)).NotTo(Equal(forward))
			Expect(Advance(template, 1)).To(Equal(forward))
		})

		It("returns an empty result when nothing is scheduled", func() {
			rows := []AdvanceRow{{Capability: Vote, OpenInPhase: nil, ClosedInPhase: nil}}

			Expect(Advance(rows, 0)).To(BeEmpty())
		})

		It("closes a capability whose window is inverted", func() {
			// An organizer can set closes before opens; it must resolve to one
			// answer rather than panicking or flapping.
			rows := []AdvanceRow{
				{Capability: Register, OpenInPhase: pos(3), ClosedInPhase: pos(1)},
			}

			for _, target := range []int{0, 1, 2, 3, 4} {
				Expect(Advance(rows, target)[Register]).
					To(BeFalse(), "should stay closed at phase %d", target)
			}
		})
	})

	Describe("Allowed", func() {
		It("allows an open capability", func() {
			Expect(Resolve([]Row{row(Register, true)}, now).Allowed(Register)).To(BeTrue())
		})

		It("blocks a closed capability", func() {
			Expect(Resolve([]Row{row(Register, false)}, now).Allowed(Register)).To(BeFalse())
		})

		It("blocks a coming capability", func() {
			// Coming is a nicer thing to tell a member, not a weaker gate.
			states := Resolve([]Row{scheduled(Register, false, at(3), nil)}, now)

			Expect(states[Register]).To(Equal(StateComing))
			Expect(states.Allowed(Register)).To(BeFalse())
		})

		It("allows an ungoverned capability", func() {
			// The regression this guards: enforcing with `state == StateOpen`
			// would reject every mutation on every hackathon that has no row
			// for the capability yet.
			Expect(Resolve(nil, now).Allowed(ProposeProjects)).To(BeTrue())
		})

		It("allows a capability missing from the map entirely", func() {
			Expect(States{}.Allowed(Vote)).To(BeTrue())
		})
	})

	Describe("All", func() {
		It("has no duplicates", func() {
			seen := map[Capability]bool{}
			for _, c := range All() {
				Expect(seen[c]).To(BeFalse(), "duplicate capability %q", c)
				seen[c] = true
			}
		})
	})
})
