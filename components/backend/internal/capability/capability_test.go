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

			Expect(states[SubmitProposal]).To(Equal(StateUngoverned))
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
			states := Resolve([]Row{scheduled(SubmitProposal, false, at(5), nil)}, now)

			Expect(states[SubmitProposal]).To(Equal(StateComing))
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
			Expect(Resolve(nil, now).Allowed(SubmitProposal)).To(BeTrue())
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
