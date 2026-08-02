//go:build test && unittest

package capability_test

import (
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	. "github.com/swissdatasciencecenter/hackagon/components/backend/internal/capability"
)

func row(c Capability, enabled bool) Row {
	return Row{Capability: c, Enabled: enabled}
}

var _ = Describe("Capability", func() {
	Describe("Resolve", func() {
		It("opens a capability whose flag is on", func() {
			states := Resolve([]Row{row(Register, true)})

			Expect(states[Register]).To(Equal(StateOpen))
		})

		It("closes a capability whose flag is off", func() {
			states := Resolve([]Row{row(Register, false)})

			Expect(states[Register]).To(Equal(StateClosed))
		})

		It("resolves each capability independently", func() {
			states := Resolve([]Row{
				row(Register, false),
				row(Vote, true),
			})

			Expect(states[Register]).To(Equal(StateClosed))
			Expect(states[Vote]).To(Equal(StateOpen))
		})

		It("reports capabilities with no row as ungoverned", func() {
			states := Resolve([]Row{row(Register, true)})

			Expect(states[SubmitProposal]).To(Equal(StateUngoverned))
			Expect(states[ViewResults]).To(Equal(StateUngoverned))
		})

		It("reports every capability as ungoverned when there are no rows", func() {
			// A hackathon predating the capability table must keep behaving
			// exactly as it did, rather than having every action disappear.
			states := Resolve(nil)

			Expect(states).To(HaveLen(len(All())))
			for _, c := range All() {
				Expect(states[c]).To(Equal(StateUngoverned))
			}
		})

		It("answers for every capability in the vocabulary", func() {
			states := Resolve([]Row{row(Register, true)})

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
			})

			Expect(states).To(HaveLen(len(All())))
			Expect(states).NotTo(HaveKey(Capability("teleport")))
			Expect(states[Register]).To(Equal(StateOpen))
		})

		It("lets the last row win when a capability appears twice", func() {
			// The unique index prevents this in the database; resolving it
			// deterministically means a violated invariant cannot become a
			// coin-flip over whether an action is allowed.
			states := Resolve([]Row{row(Vote, true), row(Vote, false)})

			Expect(states[Vote]).To(Equal(StateClosed))
		})
	})

	Describe("Allowed", func() {
		It("allows an open capability", func() {
			Expect(Resolve([]Row{row(Register, true)}).Allowed(Register)).To(BeTrue())
		})

		It("blocks a closed capability", func() {
			Expect(Resolve([]Row{row(Register, false)}).Allowed(Register)).To(BeFalse())
		})

		It("allows an ungoverned capability", func() {
			// The regression this guards: enforcing with `state == StateOpen`
			// would reject every mutation on every hackathon that has no row
			// for the capability yet.
			Expect(Resolve(nil).Allowed(SubmitProposal)).To(BeTrue())
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
