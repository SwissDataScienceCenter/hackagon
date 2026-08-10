//go:build test && unittest

package service

import (
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

// The seat rule itself, tested as the pure function it is — the service-level
// specs in capacity_test.go prove the handlers enforce it, this file proves
// the rule says what capacity.go documents.

func capPtr(v int32) *int32 { return &v }

var _ = Describe("joinLandsWaitlisted", func() {
	It("waitlists everyone when capacity is unset (the approval model)", func() {
		Expect(joinLandsWaitlisted(nil, 0, 0)).To(BeTrue())
		Expect(joinLandsWaitlisted(nil, 5, 0)).To(BeTrue())
		Expect(joinLandsWaitlisted(nil, 5, 3)).To(BeTrue())
	})

	It("treats zero and negative capacity as unlimited", func() {
		Expect(joinLandsWaitlisted(capPtr(0), 0, 0)).To(BeTrue())
		Expect(joinLandsWaitlisted(capPtr(-1), 0, 0)).To(BeTrue())
	})

	It("confirms while a place is free and nobody is waiting", func() {
		Expect(joinLandsWaitlisted(capPtr(3), 0, 0)).To(BeFalse())
		Expect(joinLandsWaitlisted(capPtr(3), 2, 0)).To(BeFalse())
		Expect(joinLandsWaitlisted(capPtr(1), 0, 0)).To(BeFalse())
	})

	It("waitlists once the confirmed roster reaches capacity", func() {
		Expect(joinLandsWaitlisted(capPtr(3), 3, 0)).To(BeTrue())
		// Over-approved (the organizer went past the cap): still full.
		Expect(joinLandsWaitlisted(capPtr(3), 4, 0)).To(BeTrue())
	})

	It("queues behind existing waiters even when a place is free", func() {
		// A freed place with people already waiting is the organizer's to hand
		// out; a new joiner must not snipe it from the head of the queue.
		Expect(joinLandsWaitlisted(capPtr(3), 2, 1)).To(BeTrue())
	})
})
