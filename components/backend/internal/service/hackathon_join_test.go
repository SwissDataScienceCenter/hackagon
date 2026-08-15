//go:build test && unittest

package service_test

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

// The three guards Join applies before it writes a row, and the role it writes
// afterwards.
//
// None of these is visible in the response: Join answers the same shape for a
// member and for an organizer, so the ROLE it granted has to be read back out
// of casbin, and a refusal has to be read back out of the roster.
var _ = Describe("HackathonService Join guards", func() {
	var (
		dbClient  *ent.Client
		conn      *grpc.ClientConn
		enf       *middleware.Enforcer
		client    hackathonSvc.HackathonServiceClient
		adminCtx  context.Context
		joinerCtx context.Context
		joiner    *ent.User
	)

	authed := func(keycloakID string) context.Context {
		return metadata.NewOutgoingContext(
			context.Background(),
			metadata.Pairs(
				"authorization",
				"Bearer "+testutils.CreateTestJWTToken(keycloakID),
			),
		)
	}

	// create makes a hackathon with the given visibility and lifespan, offset
	// from now so nothing here depends on the wall clock beyond "past" and
	// "future".
	create := func(name string, vis entities.Visibility, startsIn, endsIn time.Duration) string {
		GinkgoHelper()
		now := time.Now()
		resp, err := client.Create(adminCtx, &msgs.CreateRequest{
			Name:       name,
			Visibility: vis,
			StartsAt:   timestamppb.New(now.Add(startsIn)),
			EndsAt:     timestamppb.New(now.Add(endsIn)),
		})
		Expect(err).NotTo(HaveOccurred())

		return resp.GetHackathonId()
	}

	onRoster := func(hackathonID string) int {
		GinkgoHelper()
		n, err := dbClient.Participant.Query().Where(
			entparticipant.HackathonIDEQ(uuid.MustParse(hackathonID)),
			entparticipant.UserIDEQ(joiner.ID),
		).Count(context.Background())
		Expect(err).NotTo(HaveOccurred())

		return n
	}

	BeforeEach(func() {
		var err error
		dbClient, conn, enf = testutils.CreateTestServer()
		client = hackathonSvc.NewHackathonServiceClient(conn)
		adminCtx = authed(testutils.TestAdminKeycloakID)

		joiner, err = dbClient.User.Create().
			SetKeycloakID("join-guard-user").
			SetUsername("join-guard-user").
			Save(context.Background())
		Expect(err).NotTo(HaveOccurred())
		joinerCtx = authed("join-guard-user")
	})

	Describe("a private hackathon", func() {
		var hackathonID string

		BeforeEach(func() {
			hackathonID = create(
				"Invite Only", entities.Visibility_VISIBILITY_PRIVATE,
				24*time.Hour, 48*time.Hour,
			)
		})

		It("refuses a join that carries no invitation", func() {
			// Privacy was discovery-only before this check: knowing the UUID was
			// enough to join. The id is exactly what this caller has.
			_, err := client.Join(joinerCtx, &msgs.JoinRequest{HackathonId: hackathonID})
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			Expect(status.Convert(err).Message()).To(ContainSubstring("invitation link"))
			Expect(onRoster(hackathonID)).To(Equal(0))
		})

		It("refuses a join that carries an invitation to somewhere else", func() {
			other := create(
				"Some Other Event", entities.Visibility_VISIBILITY_PRIVATE,
				24*time.Hour, 48*time.Hour,
			)
			inv, err := client.CreateInvite(adminCtx, &msgs.CreateInviteRequest{
				HackathonId: other,
			})
			Expect(err).NotTo(HaveOccurred())

			token := inv.GetInvite().GetToken()
			_, err = client.Join(joinerCtx, &msgs.JoinRequest{
				HackathonId: hackathonID,
				InviteToken: &token,
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			Expect(onRoster(hackathonID)).To(Equal(0))
		})

		// The control for both refusals above. Without it they would both pass
		// against a Join that refused every private event outright, which is a
		// different product.
		It("admits the same join once it carries a live invitation", func() {
			inv, err := client.CreateInvite(adminCtx, &msgs.CreateInviteRequest{
				HackathonId: hackathonID,
			})
			Expect(err).NotTo(HaveOccurred())

			token := inv.GetInvite().GetToken()
			_, err = client.Join(joinerCtx, &msgs.JoinRequest{
				HackathonId: hackathonID,
				InviteToken: &token,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(onRoster(hackathonID)).To(Equal(1))
		})
	})

	It("refuses a join once the event has finished", func() {
		finished := create(
			"Last Year's Hackathon", entities.Visibility_VISIBILITY_PUBLIC,
			-48*time.Hour, -24*time.Hour,
		)

		_, err := client.Join(joinerCtx, &msgs.JoinRequest{HackathonId: finished})
		Expect(err).To(HaveOccurred())
		Expect(status.Convert(err).Code()).To(Equal(codes.FailedPrecondition))
		Expect(status.Convert(err).Message()).To(ContainSubstring("already finished"))
		Expect(onRoster(finished)).To(Equal(0))
	})

	It("still admits a join into an event that has not ended", func() {
		running := create(
			"Happening Now", entities.Visibility_VISIBILITY_PUBLIC,
			-1*time.Hour, 24*time.Hour,
		)

		_, err := client.Join(joinerCtx, &msgs.JoinRequest{HackathonId: running})
		Expect(err).NotTo(HaveOccurred())
		Expect(onRoster(running)).To(Equal(1))
	})

	It("grants the joiner Member and nothing more", func() {
		open := create(
			"Open Event", entities.Visibility_VISIBILITY_PUBLIC,
			24*time.Hour, 48*time.Hour,
		)

		_, err := client.Join(joinerCtx, &msgs.JoinRequest{HackathonId: open})
		Expect(err).NotTo(HaveOccurred())

		// Member is granted to everyone on the roster, waitlisted included —
		// that is what lets them propose and see the event they signed up for.
		// The role is read from casbin because the response cannot show it.
		role, err := enf.GetHackathonRole(joiner.KeycloakID, open)
		Expect(err).NotTo(HaveOccurred())
		Expect(role).To(Equal(entities.HackathonRole_HACKATHON_ROLE_MEMBER))

		holders, err := enf.HackathonOwners(open)
		Expect(err).NotTo(HaveOccurred())
		Expect(holders).NotTo(
			ContainElement(joiner.KeycloakID),
			"signing up must not make somebody an organizer of the event",
		)
	})
})
