//go:build test && unittest

package service_test

import (
	"context"
	"fmt"
	"sync"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

// The capacity rule end to end: Join hands out confirmed places
// first-come-first-served on capped events, queues on full ones, never
// oversells under concurrency, and leaves freed places to the organizer.
// The rule itself is specified in capacity.go and unit-tested in
// capacity_internal_test.go; these specs prove the handlers enforce it.
var _ = Describe("Capacity", func() {
	var (
		dbClient *ent.Client
		conn     *grpc.ClientConn
		client   hackathonSvc.HackathonServiceClient
		adminCtx context.Context
	)

	BeforeEach(func() {
		var enf *middleware.Enforcer
		dbClient, conn, enf = testutils.CreateTestServer()
		_ = enf
		client = hackathonSvc.NewHackathonServiceClient(conn)
		adminCtx = ctxFor(testutils.TestAdminKeycloakID)
	})

	// newJoiner inserts a platform user and returns a context carrying their
	// token — Join looks the caller up in the users table.
	newJoiner := func(username string) (uuid.UUID, context.Context) {
		keycloakID := "keycloak-" + username
		u, err := dbClient.User.Create().
			SetKeycloakID(keycloakID).
			SetUsername(username).
			Save(context.Background())
		Expect(err).NotTo(HaveOccurred())

		return u.ID, ctxFor(keycloakID)
	}

	createHackathon := func(maxParticipants int32) string {
		req := &msgs.CreateRequest{
			Name:       fmt.Sprintf("Capacity Hackathon %s", uuid.NewString()[:8]),
			Visibility: entities.Visibility_VISIBILITY_PUBLIC,
		}
		if maxParticipants > 0 {
			req.MaxParticipants = &maxParticipants
		}
		resp, err := client.Create(adminCtx, req)
		Expect(err).NotTo(HaveOccurred())

		return resp.GetHackathonId()
	}

	rosterCounts := func(hackathonID string) (confirmed, waiting int) {
		id := uuid.MustParse(hackathonID)
		var err error
		confirmed, err = dbClient.Participant.Query().Where(
			entparticipant.HackathonIDEQ(id),
			entparticipant.IsWaitingEQ(false),
		).Count(context.Background())
		Expect(err).NotTo(HaveOccurred())
		waiting, err = dbClient.Participant.Query().Where(
			entparticipant.HackathonIDEQ(id),
			entparticipant.IsWaitingEQ(true),
		).Count(context.Background())
		Expect(err).NotTo(HaveOccurred())

		return confirmed, waiting
	}

	It("keeps the approval model for uncapped events", func() {
		hid := createHackathon(0)

		_, actx := newJoiner("uncapped-a")
		resp, err := client.Join(actx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeTrue(), "uncapped events waitlist everyone")
		Expect(resp.GetQueuePosition()).To(BeInt32(1))

		_, bctx := newJoiner("uncapped-b")
		resp, err = client.Join(bctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeTrue())
		Expect(resp.GetQueuePosition()).To(BeInt32(2))
	})

	It("hands out places first-come-first-served on a capped event", func() {
		// Capacity 3; the creator already holds one confirmed place.
		hid := createHackathon(3)

		_, actx := newJoiner("fcfs-a")
		resp, err := client.Join(actx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeFalse(), "a free place is taken outright")
		Expect(resp.GetQueuePosition()).To(BeInt32(0))

		// Fills the last place.
		_, bctx := newJoiner("fcfs-b")
		resp, err = client.Join(bctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeFalse())

		// Full: joining SUCCEEDS and queues — not an error.
		_, cctx := newJoiner("fcfs-c")
		resp, err = client.Join(cctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeTrue())
		Expect(resp.GetQueuePosition()).To(BeInt32(1))

		_, dctx := newJoiner("fcfs-d")
		resp, err = client.Join(dctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeTrue())
		Expect(resp.GetQueuePosition()).To(BeInt32(2))

		confirmed, waiting := rosterCounts(hid)
		Expect(confirmed).To(Equal(3))
		Expect(waiting).To(Equal(2))
	})

	It("reports the current state on an idempotent re-join", func() {
		hid := createHackathon(2)

		_, actx := newJoiner("rejoin-a")
		resp, err := client.Join(actx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeFalse())

		// Confirmed stays confirmed.
		resp, err = client.Join(actx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeFalse())

		_, bctx := newJoiner("rejoin-b")
		resp, err = client.Join(bctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeTrue())
		Expect(resp.GetQueuePosition()).To(BeInt32(1))

		// Queued reports the same place, and no duplicate row appears.
		resp, err = client.Join(bctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeTrue())
		Expect(resp.GetQueuePosition()).To(BeInt32(1))

		confirmed, waiting := rosterCounts(hid)
		Expect(confirmed).To(Equal(2))
		Expect(waiting).To(Equal(1))
	})

	It("lets an organizer approve past capacity", func() {
		// Capacity 1 — the creator holds the only place.
		hid := createHackathon(1)

		uid, uctx := newJoiner("over-a")
		resp, err := client.Join(uctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeTrue())

		// The room fits one more: approving past the cap must WORK.
		_, err = client.ApproveParticipant(adminCtx, &msgs.ApproveParticipantRequest{
			HackathonId: hid,
			UserId:      uid.String(),
		})
		Expect(err).NotTo(HaveOccurred())

		confirmed, waiting := rosterCounts(hid)
		Expect(confirmed).To(Equal(2), "2 confirmed of capacity 1 — deliberate overshoot")
		Expect(waiting).To(Equal(0))
	})

	It("leaves a freed place to the organizer and keeps the queue unjumped", func() {
		// Capacity 2: creator + A fill it, B queues.
		hid := createHackathon(2)

		aID, actx := newJoiner("freed-a")
		resp, err := client.Join(actx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeFalse())

		bID, bctx := newJoiner("freed-b")
		resp, err = client.Join(bctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeTrue())

		// A confirmed participant leaves: a place frees up.
		_, err = client.RemoveParticipant(adminCtx, &msgs.RemoveParticipantRequest{
			HackathonId: hid,
			UserId:      aID.String(),
		})
		Expect(err).NotTo(HaveOccurred())

		// Nobody is promoted automatically: B still waits.
		b, err := dbClient.Participant.Query().Where(
			entparticipant.HackathonIDEQ(uuid.MustParse(hid)),
			entparticipant.UserIDEQ(bID),
		).Only(context.Background())
		Expect(err).NotTo(HaveOccurred())
		Expect(b.IsWaiting).To(BeTrue(), "freed places are not handed out automatically")

		// And a NEW joiner does not snipe the free place from B — they queue
		// behind.
		_, cctx := newJoiner("freed-c")
		resp, err = client.Join(cctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(
			resp.GetWaitlisted(),
		).To(BeTrue(), "a free place with people waiting belongs to the queue")
		Expect(resp.GetQueuePosition()).To(BeInt32(2))

		// The organizer hands the place out by hand.
		_, err = client.ApproveParticipant(adminCtx, &msgs.ApproveParticipantRequest{
			HackathonId: hid,
			UserId:      bID.String(),
		})
		Expect(err).NotTo(HaveOccurred())

		confirmed, waiting := rosterCounts(hid)
		Expect(confirmed).To(Equal(2))
		Expect(waiting).To(Equal(1))
	})

	It("lowering the capacity below the confirmed count removes nobody", func() {
		hid := createHackathon(3)

		for i := 0; i < 2; i++ {
			_, uctx := newJoiner(fmt.Sprintf("lower-%d", i))
			resp, err := client.Join(uctx, &msgs.JoinRequest{HackathonId: hid})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetWaitlisted()).To(BeFalse())
		}

		one := int32(1)
		edited, err := client.Edit(adminCtx, &msgs.EditRequest{
			HackathonId:     hid,
			MaxParticipants: &one,
		})
		Expect(err).NotTo(HaveOccurred())
		Expect(edited.GetHackathon().GetMaxParticipants()).To(BeInt32(1))

		confirmed, _ := rosterCounts(hid)
		Expect(confirmed).To(Equal(3), "3 confirmed stay confirmed under a cap of 1")

		// The event is (over-)full now, so a new joiner queues.
		_, uctx := newJoiner("lower-late")
		resp, err := client.Join(uctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeTrue())
	})

	It("clears the capacity back to unlimited with 0", func() {
		hid := createHackathon(2)

		zero := int32(0)
		edited, err := client.Edit(adminCtx, &msgs.EditRequest{
			HackathonId:     hid,
			MaxParticipants: &zero,
		})
		Expect(err).NotTo(HaveOccurred())
		Expect(edited.GetHackathon().MaxParticipants).To(BeNil())

		// Unlimited means the approval model again: new joiners wait.
		_, uctx := newJoiner("cleared-a")
		resp, err := client.Join(uctx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeTrue())
	})

	// The seat accounting AT the boundary, walked one join at a time.
	//
	// This is the deterministic twin of the concurrency spec below. That one
	// asks whether two simultaneous joins can share the last place; this one
	// asks where the last place IS, which is the half an off-by-one cap breaks
	// and the half that needs no goroutines to see. The claim is read back from
	// the DB after every join rather than inferred from the responses, because
	// "Join answered waitlisted" and "the roster holds N" are different facts —
	// the same distinction the race spec makes when it counts rows at the end.
	//
	// Three capacities, because a rule that is off by one is off by one at every
	// cap and a single number cannot tell "the boundary moved" from "this
	// particular event was set up wrong". Capacity 1 has no free seat to hand
	// out at all; capacities 2 and 3 do, and their confirmed joins are the
	// positive control that keeps the waitlist assertions from agreeing with an
	// event that simply queues everybody.
	It("seats exactly the capacity, counting the roster after every join", func() {
		for _, capacity := range []int{1, 2, 3} {
			hid := createHackathon(int32(capacity))

			// The creator already holds seat 1, so capacity-1 more joiners fill
			// the room exactly. Each one must be seated, and the confirmed count
			// must be exactly the seat they took.
			for seat := 2; seat <= capacity; seat++ {
				_, uctx := newJoiner(fmt.Sprintf("seats-%d-%d", capacity, seat))
				resp, err := client.Join(uctx, &msgs.JoinRequest{HackathonId: hid})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetWaitlisted()).To(
					BeFalse(),
					"capacity %d: seat %d is still free, so it is handed out", capacity, seat,
				)

				confirmed, waiting := rosterCounts(hid)
				Expect(confirmed).To(
					Equal(seat),
					"capacity %d: confirmed roster after filling seat %d", capacity, seat,
				)
				Expect(waiting).To(Equal(0))
			}

			// The room is now exactly full. The next arrival queues, and the
			// confirmed roster does NOT move: capacity is the number of seats,
			// not the number of seats plus one.
			_, overCtx := newJoiner(fmt.Sprintf("seats-%d-over", capacity))
			resp, err := client.Join(overCtx, &msgs.JoinRequest{HackathonId: hid})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetWaitlisted()).To(
				BeTrue(),
				"capacity %d: there is no seat %d — the room is full", capacity, capacity+1,
			)
			Expect(resp.GetQueuePosition()).To(BeInt32(1))

			confirmed, waiting := rosterCounts(hid)
			Expect(confirmed).To(
				Equal(capacity),
				"capacity %d: the confirmed roster equals the capacity, never one more", capacity,
			)
			Expect(waiting).To(Equal(1))
		}
	})

	It("never oversells the last place under simultaneous joins", func() {
		// Capacity 3, creator + one joiner confirmed: ONE place left.
		hid := createHackathon(3)
		_, warmCtx := newJoiner("race-warm")
		resp, err := client.Join(warmCtx, &msgs.JoinRequest{HackathonId: hid})
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetWaitlisted()).To(BeFalse())

		// Six people hit Join the moment the link drops.
		const racers = 6
		ctxs := make([]context.Context, racers)
		for i := range ctxs {
			_, ctxs[i] = newJoiner(fmt.Sprintf("racer-%d", i))
		}

		var (
			start sync.WaitGroup
			done  sync.WaitGroup
		)
		start.Add(1)
		results := make([]*msgs.JoinResponse, racers)
		errs := make([]error, racers)
		for i := range ctxs {
			done.Add(1)
			go func(i int) {
				defer done.Done()
				defer GinkgoRecover()
				start.Wait() // one barrier, so the calls really are simultaneous
				results[i], errs[i] = client.Join(ctxs[i], &msgs.JoinRequest{HackathonId: hid})
			}(i)
		}
		start.Done()
		done.Wait()

		// Every join SUCCEEDS — landing on the waiting list is not an error.
		confirmedResponses := 0
		for i := range results {
			Expect(errs[i]).NotTo(HaveOccurred(), "racer %d", i)
			if !results[i].GetWaitlisted() {
				confirmedResponses++
			}
		}
		Expect(confirmedResponses).To(Equal(1), "exactly one racer takes the last place")

		// The end state, not the responses, is the invariant: confirmed ==
		// capacity exactly, everyone else queued.
		confirmed, waiting := rosterCounts(hid)
		Expect(confirmed).To(Equal(3), "the confirmed roster must equal capacity — never oversold")
		Expect(waiting).To(Equal(racers - 1))
	})
})

func ctxFor(keycloakID string) context.Context {
	return metadata.NewOutgoingContext(
		context.Background(),
		metadata.Pairs(
			"authorization",
			"Bearer "+testutils.CreateTestJWTToken(keycloakID),
		),
	)
}

// BeInt32 avoids Equal's int/int32 type mismatch noise.
func BeInt32(v int32) OmegaMatcher {
	return BeEquivalentTo(v)
}
