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
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

// AddOwner / RemoveOwner.
//
// OWNERSHIP IS A CASBIN FACT ON THIS BRANCH — there is no owners column to
// count — so every assertion here goes through the enforcer the server itself
// holds (testutils.CreateTestServer hands back that instance, not a copy).
// Asserting on the gRPC response alone would be the container-holds-the-thing
// trap: RemoveOwner answers with an empty message, so "it returned OK" says
// nothing about who ends up holding what.
//
// Nothing here opens an ent transaction: casbin writes on its own connection,
// and a transaction held across one deadlocks.
var _ = Describe("HackathonService owner roles", func() {
	var (
		dbClient    *ent.Client
		conn        *grpc.ClientConn
		enf         *middleware.Enforcer
		client      hackathonSvc.HackathonServiceClient
		adminCtx    context.Context
		admin       string
		hackathonID string
		bob         *ent.User
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

	owners := func() []string {
		GinkgoHelper()
		list, err := enf.HackathonOwners(hackathonID)
		Expect(err).NotTo(HaveOccurred())

		return list
	}

	roleOf := func(keycloakID string) entities.HackathonRole {
		GinkgoHelper()
		role, err := enf.GetHackathonRole(keycloakID, hackathonID)
		Expect(err).NotTo(HaveOccurred())

		return role
	}

	// The owner RPCs address people by platform UUID while casbin holds Keycloak
	// ids, and mixing the two silently addresses nobody.
	platformID := func(keycloakID string) string {
		GinkgoHelper()
		u, err := dbClient.User.Query().
			Where(entuser.KeycloakIDEQ(keycloakID)).
			Only(context.Background())
		Expect(err).NotTo(HaveOccurred())

		return u.ID.String()
	}

	BeforeEach(func() {
		dbClient, conn, enf = testutils.CreateTestServer()
		client = hackathonSvc.NewHackathonServiceClient(conn)
		admin = testutils.TestAdminKeycloakID
		adminCtx = authed(admin)

		now := time.Now()
		created, err := client.Create(adminCtx, &msgs.CreateRequest{
			Name:       "Owned Hackathon",
			Visibility: entities.Visibility_VISIBILITY_PUBLIC,
			StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
			EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
		})
		Expect(err).NotTo(HaveOccurred())
		hackathonID = created.GetHackathonId()

		// bob is a CONFIRMED participant and nothing more. The row is written
		// directly rather than through Join on purpose: Join grants Member, and
		// a bob who already held Member could not show that RemoveOwner is what
		// gives it back to him.
		bob, err = dbClient.User.Create().
			SetKeycloakID("owner-test-bob").
			SetUsername("owner-test-bob").
			Save(context.Background())
		Expect(err).NotTo(HaveOccurred())
		_, err = dbClient.Participant.Create().
			SetHackathonID(uuid.MustParse(hackathonID)).
			SetUserID(bob.ID).
			SetIsWaiting(false).
			Save(context.Background())
		Expect(err).NotTo(HaveOccurred())
	})

	// Creating the event makes its creator the sole owner. Stated here because
	// every spec below is a statement about moving away from that.
	It("makes the creator the only owner", func() {
		Expect(owners()).To(ConsistOf(admin))
		Expect(roleOf(admin)).To(Equal(entities.HackathonRole_HACKATHON_ROLE_OWNER))
	})

	Describe("RemoveOwner", func() {
		It("refuses to demote the last organizer", func() {
			// A SECOND global admin does the asking, so the refusal cannot come
			// from the self-demotion rule: this is the last-organizer guard on
			// its own, with a caller who is allowed to do everything else.
			_, err := enf.AddGlobalRole("owner-test-superadmin", middleware.Admin)
			Expect(err).NotTo(HaveOccurred())

			_, err = client.RemoveOwner(
				authed("owner-test-superadmin"),
				&msgs.RemoveOwnerRequest{HackathonId: hackathonID, UserId: platformID(admin)},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.FailedPrecondition))
			Expect(status.Convert(err).Message()).To(ContainSubstring("last organizer"))

			Expect(owners()).To(
				ConsistOf(admin),
				"an event left with zero owners can be edited by nobody short of a global admin",
			)
		})

		It(
			"refuses an organizer demoting themselves, even with a co-organizer to fall back on",
			func() {
				// The co-organizer matters: with one owner this would be refused by
				// the last-organizer guard, which runs first, and the spec would
				// pass with the self-demotion rule deleted.
				_, err := client.AddOwner(
					adminCtx,
					&msgs.AddOwnerRequest{HackathonId: hackathonID, UserId: bob.ID.String()},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(owners()).To(ConsistOf(admin, bob.KeycloakID))

				_, err = client.RemoveOwner(
					adminCtx,
					&msgs.RemoveOwnerRequest{HackathonId: hackathonID, UserId: platformID(admin)},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
				Expect(
					status.Convert(err).Message(),
				).To(ContainSubstring("your own organizer role"))

				Expect(owners()).To(ContainElement(admin))
			},
		)

		It("gives a demoted co-organizer Member back", func() {
			_, err := client.AddOwner(
				adminCtx,
				&msgs.AddOwnerRequest{HackathonId: hackathonID, UserId: bob.ID.String()},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(roleOf(bob.KeycloakID)).
				To(Equal(entities.HackathonRole_HACKATHON_ROLE_OWNER))

			_, err = client.RemoveOwner(
				adminCtx,
				&msgs.RemoveOwnerRequest{HackathonId: hackathonID, UserId: bob.ID.String()},
			)
			Expect(err).NotTo(HaveOccurred())

			Expect(owners()).To(ConsistOf(admin))
			// Not merely "no longer an owner": without the Member grant the role
			// resolves to UNSPECIFIED, which renders as a corrupted record
			// rather than a demotion.
			Expect(roleOf(bob.KeycloakID)).
				To(Equal(entities.HackathonRole_HACKATHON_ROLE_MEMBER))
		})

		It("refuses to demote a participant who is not an organizer", func() {
			_, err := client.RemoveOwner(
				adminCtx,
				&msgs.RemoveOwnerRequest{HackathonId: hackathonID, UserId: bob.ID.String()},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
			Expect(owners()).To(ConsistOf(admin))
		})
	})
})
