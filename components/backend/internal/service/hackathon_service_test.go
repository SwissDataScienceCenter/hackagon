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
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("HackathonService", func() {

	var (
		dbClient  *ent.Client
		conn      *grpc.ClientConn
		enf       *middleware.Enforcer
		client    hackathonSvc.HackathonServiceClient
		testAdmin string
	)

	BeforeEach(func() {
		dbClient, conn, enf = testutils.CreateTestServer()
		testAdmin = testutils.TestAdminKeycloakID

		client = hackathonSvc.NewHackathonServiceClient(conn)
	})

	Describe("Create", func() {
		// newUser inserts a user and returns its Keycloak ID. Create looks the
		// caller up in the users table, so a token alone is not enough.
		newUser := func(username string) string {
			keycloakID := "keycloak-" + username
			_, err := dbClient.User.Create().
				SetKeycloakID(keycloakID).
				SetUsername(username).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			return keycloakID
		}

		It("creates hackathon successfully with admin token", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			desc := "A test hackathon description"
			req := &msgs.CreateRequest{
				Name:        "Test Hackathon",
				Description: &desc,
				Visibility:  entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			}

			resp, err := client.Create(ctx, req)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetHackathonId()).NotTo(BeEmpty())

			// Verify in database
			h, err := dbClient.Hackathon.Query().
				Where(enthackathon.IDEQ(uuid.MustParse(resp.GetHackathonId()))).
				WithCreator().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(h.Name).To(Equal("Test Hackathon"))
			Expect(h.Visibility).To(Equal(enthackathon.VisibilityPublic))
			Expect(h.Edges.Creator).NotTo(BeNil())
			Expect(h.Edges.Creator.KeycloakID).To(Equal(testAdmin))
		})

		It("creates hackathon successfully for a global hackathon organizer", func() {
			organizer := newUser("organizer")
			_, err := enf.AddGlobalRole(organizer, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(organizer)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			resp, err := client.Create(ctx, &msgs.CreateRequest{
				Name:       "Organizer Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetHackathonId()).NotTo(BeEmpty())

			// The creator must also come out as owner of what they just created.
			role, err := enf.GetHackathonRole(organizer, resp.GetHackathonId())
			Expect(err).NotTo(HaveOccurred())
			Expect(role).To(Equal(entities.HackathonRole_HACKATHON_ROLE_OWNER))
		})

		// The owner shell reads membership from the participants table, not from
		// casbin, so a creator missing here is an owner who cannot open their own
		// hackathon and does not see it listed on their dashboard.
		It("enrolls the creator as a confirmed participant", func() {
			organizer := newUser("organizer")
			_, err := enf.AddGlobalRole(organizer, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(organizer)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			created, err := client.Create(ctx, &msgs.CreateRequest{
				Name:       "Owned Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PRIVATE,
			})
			Expect(err).NotTo(HaveOccurred())

			p, err := dbClient.Participant.Query().
				Where(entparticipant.HackathonIDEQ(uuid.MustParse(created.GetHackathonId()))).
				WithUser().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.IsWaiting).To(BeFalse())
			Expect(p.Edges.User.KeycloakID).To(Equal(organizer))

			// ...and surfaces through Get as an owner, which is what the owner
			// shell gates on.
			got, err := client.Get(ctx, &msgs.GetRequest{
				HackathonId: created.GetHackathonId(),
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(got.GetHackathon().GetMembers()).To(HaveLen(1))
			member := got.GetHackathon().GetMembers()[0]
			Expect(member.GetUser().GetKeycloakId()).To(Equal(organizer))
			Expect(member.GetRole()).To(Equal(entities.HackathonRole_HACKATHON_ROLE_OWNER))
		})

		It("denies a user without the organizer role", func() {
			plain := newUser("plain")

			token := testutils.CreateTestJWTToken(plain)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Create(ctx, &msgs.CreateRequest{
				Name:       "Should Not Exist",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
			})
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})

		It("does not let an organizer write another owner's hackathon", func() {
			organizer := newUser("organizer")
			_, err := enf.AddGlobalRole(organizer, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			// A hackathon the organizer has no role in.
			adminToken := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+adminToken),
			)
			created, err := client.Create(adminCtx, &msgs.CreateRequest{
				Name:       "Admin Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PRIVATE,
			})
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(organizer)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			newName := "Hijacked"
			_, err = client.Edit(ctx, &msgs.EditRequest{
				HackathonId: created.GetHackathonId(),
				Name:        &newName,
			})
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("List", func() {
		var hackathons []struct {
			name       string
			visibility entities.Visibility
		}

		BeforeEach(func() {
			hackathons = []struct {
				name       string
				visibility entities.Visibility
			}{
				{
					name:       "Public Hack 1",
					visibility: entities.Visibility_VISIBILITY_PUBLIC,
				},
				{
					name:       "Public Hack 2",
					visibility: entities.Visibility_VISIBILITY_PUBLIC,
				},
				{
					name:       "Private Hack",
					visibility: entities.Visibility_VISIBILITY_PRIVATE,
				},
			}

			// Create hackathons using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			for _, h := range hackathons {
				req := &msgs.CreateRequest{
					Name:       h.name,
					Visibility: h.visibility,
				}
				_, err := client.Create(ctx, req)
				Expect(err).NotTo(HaveOccurred())
			}
		})

		It("lists all hackathons for authorized user", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := client.List(ctx, &msgs.ListRequest{})
			Expect(err).NotTo(HaveOccurred())
			Expect(listResp.GetHackathons()).To(HaveLen(len(hackathons)))

			// Verify each hackathon exists in list
			for _, expected := range hackathons {
				found := false
				for _, actual := range listResp.GetHackathons() {
					if actual.GetName() == expected.name &&
						actual.GetVisibility() == expected.visibility {
						found = true

						break
					}
				}
				Expect(found).To(BeTrue(), "should find %s in list", expected.name)
			}
		})

		It("returns correct fields for each hackathon", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := client.List(ctx, &msgs.ListRequest{})
			Expect(err).NotTo(HaveOccurred())
			Expect(len(listResp.GetHackathons())).To(BeNumerically(">", 0))

			// Check first hackathon has required fields
			h := listResp.GetHackathons()[0]
			Expect(h.GetId()).NotTo(BeEmpty())
			Expect(h.GetName()).NotTo(BeEmpty())
			Expect(h.GetVisibility()).NotTo(Equal(entities.Visibility_VISIBILITY_UNSPECIFIED))
		})
	})

	Describe("Get", func() {
		var createdID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createReq := &msgs.CreateRequest{
				Name:       "Get Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			}

			createResp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			Expect(createResp.GetHackathonId()).NotTo(BeEmpty())
			createdID = createResp.GetHackathonId()
		})

		It("retrieves hackathon with full details", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getReq := &msgs.GetRequest{HackathonId: createdID}
			getResp, err := client.Get(ctx, getReq)
			Expect(err).NotTo(HaveOccurred())

			h := getResp.GetHackathon()
			Expect(h.GetId()).To(Equal(createdID))
			Expect(h.GetName()).To(Equal("Get Test Hackathon"))
			Expect(h.GetVisibility()).To(Equal(entities.Visibility_VISIBILITY_PUBLIC))

			// Check creator is populated
			Expect(h.GetCreator()).NotTo(BeNil())
			Expect(h.GetCreator().GetKeycloakId()).To(Equal(testAdmin))
			Expect(h.GetCreator().GetUsername()).To(Equal("hackagon-admin"))
		})

		It("returns correct status", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getReq := &msgs.GetRequest{HackathonId: createdID}
			getResp, err := client.Get(ctx, getReq)
			Expect(err).NotTo(HaveOccurred())

			h := getResp.GetHackathon()
			// Status should be computed based on dates
			Expect(
				h.GetStatus(),
			).NotTo(Equal(entities.HackathonStatus_HACKATHON_STATUS_UNSPECIFIED))
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getReq := &msgs.GetRequest{HackathonId: uuid.NewString()}
			_, err := client.Get(ctx, getReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})
	})

	Describe("Join", func() {
		var createdHackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createReq := &msgs.CreateRequest{
				Name:       "Join Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			}

			createResp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			Expect(createResp.GetHackathonId()).NotTo(BeEmpty())
			createdHackathonID = createResp.GetHackathonId()
		})

		It("allows authorized user to join hackathon", func() {
			// Create a non-admin test user
			nonAdminKeycloakID := "non-admin"
			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First ensure user exists in DB
			user, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("test-join-user").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Join the hackathon
			joinReq := &msgs.JoinRequest{HackathonId: createdHackathonID}
			joinResp, err := client.Join(ctx, joinReq)
			Expect(err).NotTo(HaveOccurred())
			Expect(joinResp.GetHackathonId()).To(Equal(createdHackathonID))

			// Verify participant was created with is_waiting=true
			participant, err := dbClient.Participant.Query().Where(
				entparticipant.HackathonIDEQ(uuid.MustParse(createdHackathonID)),
				entparticipant.UserIDEQ(user.ID),
			).Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(participant.IsWaiting).To(BeTrue(), "participant should be waitlisted")
		})

		It("returns success if user already joined (idempotent)", func() {
			nonAdminKeycloakID := "non-admin"
			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Ensure user exists in DB
			user, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("test-join-user-2").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Join first time
			joinReq := &msgs.JoinRequest{HackathonId: createdHackathonID}
			_, err = client.Join(ctx, joinReq)
			Expect(err).NotTo(HaveOccurred())

			// Join again - should succeed without error
			joinResp, err := client.Join(ctx, joinReq)
			Expect(err).NotTo(HaveOccurred())
			Expect(joinResp.GetHackathonId()).To(Equal(createdHackathonID))

			// Verify participant exists
			participant, err := dbClient.Participant.Query().Where(
				entparticipant.HackathonIDEQ(uuid.MustParse(createdHackathonID)),
				entparticipant.UserIDEQ(user.ID),
			).Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(participant.IsWaiting).To(BeTrue())
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			joinReq := &msgs.JoinRequest{HackathonId: uuid.NewString()}
			_, err := client.Join(ctx, joinReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND for non-existent user", func() {
			// Use a Keycloak ID that doesn't exist in DB
			nonExistentKeycloakID := "non-existent"
			token := testutils.CreateTestJWTToken(nonExistentKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			joinReq := &msgs.JoinRequest{HackathonId: createdHackathonID}
			_, err := client.Join(ctx, joinReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires authentication to join", func() {
			// First create user as admin to simulate sync
			anonKeycloakID := "anonymous"
			_, err := dbClient.User.Create().
				SetKeycloakID(anonKeycloakID).
				SetUsername("anonymous-joiner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Join without auth header - should fail due to missing auth
			ctx := context.Background()
			joinReq := &msgs.JoinRequest{HackathonId: createdHackathonID}
			joinResp, err := client.Join(ctx, joinReq)
			Expect(err).To(HaveOccurred())
			Expect(joinResp).To(BeNil())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.Unauthenticated))
		})
	})

	Describe("ApproveParticipant", func() {
		var createdHackathonID string
		var waitlistedUser *ent.User

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createReq := &msgs.CreateRequest{
				Name:       "Approve Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			}

			createResp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createResp.GetHackathonId()

			// Create a waitlisted user and participant
			waitlistedUser, err = dbClient.User.Create().
				SetKeycloakID("approve-test-user").
				SetUsername("approve-test-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			_, err = dbClient.Participant.Create().
				SetHackathonID(uuid.MustParse(createdHackathonID)).
				SetUserID(waitlistedUser.ID).
				SetIsWaiting(true).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
		})

		It("allows owner to approve a pending participant", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			approveReq := &msgs.ApproveParticipantRequest{
				HackathonId: createdHackathonID,
				UserId:      waitlistedUser.ID.String(),
			}

			_, err := client.ApproveParticipant(ctx, approveReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify participant was updated with is_waiting=false
			participant, err := dbClient.Participant.Query().Where(
				entparticipant.HackathonIDEQ(uuid.MustParse(createdHackathonID)),
				entparticipant.UserID(waitlistedUser.ID),
			).Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(participant.IsWaiting).To(BeFalse(), "participant should be approved")
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			approveReq := &msgs.ApproveParticipantRequest{
				HackathonId: uuid.NewString(),
				UserId:      waitlistedUser.ID.String(),
			}

			_, err := client.ApproveParticipant(ctx, approveReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND for non-existent user to approve", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			approveReq := &msgs.ApproveParticipantRequest{
				HackathonId: createdHackathonID,
				UserId:      uuid.NewString(),
			}

			_, err := client.ApproveParticipant(ctx, approveReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission to approve", func() {
			// Use a user who is not an owner/organizer
			nonOwnerKeycloakID := "non-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			approveReq := &msgs.ApproveParticipantRequest{
				HackathonId: createdHackathonID,
				UserId:      waitlistedUser.KeycloakID,
			}

			_, err = client.ApproveParticipant(ctx, approveReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("RemoveParticipant", func() {
		var createdHackathonID string
		var participantUser *ent.User

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createReq := &msgs.CreateRequest{
				Name:       "Remove Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			}

			createResp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createResp.GetHackathonId()

			// Create a participant user
			participantUser, err = dbClient.User.Create().
				SetKeycloakID("remove-test-user").
				SetUsername("remove-test-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Create the participant record
			_, err = dbClient.Participant.Create().
				SetHackathonID(uuid.MustParse(createdHackathonID)).
				SetUserID(participantUser.ID).
				SetIsWaiting(false).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
		})

		It("allows owner to remove a participant", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			removeReq := &msgs.RemoveParticipantRequest{
				HackathonId: createdHackathonID,
				UserId:      participantUser.ID.String(),
			}

			_, err := client.RemoveParticipant(ctx, removeReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify participant was deleted
			_, err = dbClient.Participant.Query().Where(
				entparticipant.HackathonIDEQ(uuid.MustParse(createdHackathonID)),
				entparticipant.UserID(participantUser.ID),
			).Only(context.Background())
			Expect(err).To(HaveOccurred())
			Expect(ent.IsNotFound(err)).To(BeTrue())
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			removeReq := &msgs.RemoveParticipantRequest{
				HackathonId: uuid.NewString(),
				UserId:      participantUser.ID.String(),
			}

			_, err := client.RemoveParticipant(ctx, removeReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND for non-existent user to remove", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			removeReq := &msgs.RemoveParticipantRequest{
				HackathonId: createdHackathonID,
				UserId:      uuid.NewString(),
			}

			_, err := client.RemoveParticipant(ctx, removeReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission to remove", func() {
			// Use a user who is not an owner/organizer
			nonOwnerKeycloakID := "non-owner-remove"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-remove-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			removeReq := &msgs.RemoveParticipantRequest{
				HackathonId: createdHackathonID,
				UserId:      participantUser.KeycloakID,
			}

			_, err = client.RemoveParticipant(ctx, removeReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Edit", func() {
		var createdHackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createReq := &msgs.CreateRequest{
				Name:        "Edit Test Hackathon",
				Description: testutils.StringPtr("Original description"),
				Visibility:  entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			}

			createResp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			Expect(createResp.GetHackathonId()).NotTo(BeEmpty())
			createdHackathonID = createResp.GetHackathonId()
		})

		It("allows admin to edit hackathon fields", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			newName := "Updated Hackathon Name"
			newDesc := testutils.StringPtr("Updated description")
			newVis := entities.Visibility_VISIBILITY_PRIVATE

			editReq := &msgs.EditRequest{
				HackathonId: createdHackathonID,
				Name:        testutils.StringPtr(newName),
				Description: newDesc,
				Visibility:  &newVis,
			}

			editResp, err := client.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())
			h := editResp.GetHackathon()
			Expect(h.GetId()).To(Equal(createdHackathonID))
			Expect(h.GetName()).To(Equal(newName))
			Expect(h.GetDescription()).To(Equal(*newDesc))
			Expect(h.GetVisibility()).To(Equal(newVis))

			// Verify in database
			var h2 *ent.Hackathon
			h2, err = dbClient.Hackathon.Query().
				Where(enthackathon.IDEQ(uuid.MustParse(createdHackathonID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(h2.Name).To(Equal(newName))
			Expect(h2.Visibility).To(Equal(enthackathon.VisibilityPrivate))
		})

		It("allows partial updates (only provided fields)", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Only update name, keep other fields as-is
			newName := "Partially Updated"
			editReq := &msgs.EditRequest{
				HackathonId: createdHackathonID,
				Name:        &newName,
			}

			editResp, err := client.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())
			h := editResp.GetHackathon()
			Expect(h.GetName()).To(Equal(newName))
			// Original description should be preserved
			Expect(h.GetDescription()).To(Equal("Original description"))
			Expect(h.GetVisibility()).To(Equal(entities.Visibility_VISIBILITY_PUBLIC))
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			editReq := &msgs.EditRequest{
				HackathonId: uuid.NewString(),
				Name:        testutils.StringPtr("Should fail"),
			}

			_, err := client.Edit(ctx, editReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission to edit", func() {
			// Use a user who is not an owner/organizer
			nonOwnerKeycloakID := "non-owner-edit"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-edit-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			editReq := &msgs.EditRequest{
				HackathonId: createdHackathonID,
				Name:        testutils.StringPtr("Unauthorized edit"),
			}

			_, err = client.Edit(ctx, editReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("validates starts_at/ends_at constraint", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			// ends_at before starts_at - should fail validation
			editReq := &msgs.EditRequest{
				HackathonId: createdHackathonID,
				StartsAt:    timestamppb.New(now.Add(48 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(24 * time.Hour)),
			}

			_, err := client.Edit(ctx, editReq)
			Expect(err).To(HaveOccurred())

			// Validation error should be returned
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("denies anonymous users from editing", func() {
			// Anonymous user has read permission on public hackathons but not write
			ctx := context.Background()

			editReq := &msgs.EditRequest{
				HackathonId: createdHackathonID,
				Name:        testutils.StringPtr("Anonymous edit"),
			}

			_, err := client.Edit(ctx, editReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("allows editing timestamps", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			newStartsAt := now.Add(72 * time.Hour)
			newEndsAt := now.Add(120 * time.Hour)

			editReq := &msgs.EditRequest{
				HackathonId: createdHackathonID,
				StartsAt:    timestamppb.New(newStartsAt),
				EndsAt:      timestamppb.New(newEndsAt),
			}

			editResp, err := client.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())
			h := editResp.GetHackathon()
			// Compare timestamps (allowing for minor precision differences from DB)
			Expect(h.GetStartsAt().AsTime()).To(BeTemporally("==", newStartsAt))
			Expect(h.GetEndsAt().AsTime()).To(BeTemporally("==", newEndsAt))
		})

		It("allows editing the logo field", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			newLogo := "https://example.com/logo.png"
			editReq := &msgs.EditRequest{
				HackathonId: createdHackathonID,
				Logo:        &newLogo,
			}

			editResp, err := client.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())
			h := editResp.GetHackathon()
			Expect(h.GetLogo()).To(Equal(newLogo))

			// Verify in database
			h2, err := dbClient.Hackathon.Query().
				Where(enthackathon.IDEQ(uuid.MustParse(createdHackathonID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(h2.Logo).To(Equal(newLogo))
		})

		It("allows editing logo and visibility together", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			newLogo := "https://example.com/new-logo.png"
			newVis := entities.Visibility_VISIBILITY_PRIVATE
			editReq := &msgs.EditRequest{
				HackathonId: createdHackathonID,
				Logo:        &newLogo,
				Visibility:  &newVis,
			}

			editResp, err := client.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())
			h := editResp.GetHackathon()
			Expect(h.GetLogo()).To(Equal(newLogo))
			Expect(h.GetVisibility()).To(Equal(newVis))

			// Verify in database
			h2, err := dbClient.Hackathon.Query().
				Where(enthackathon.IDEQ(uuid.MustParse(createdHackathonID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(h2.Logo).To(Equal(newLogo))
			Expect(h2.Visibility).To(Equal(enthackathon.VisibilityPrivate))
		})

		It("allows setting logo to empty string (clearing)", func() {
			// First set a logo
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			initialLogo := "https://example.com/initial-logo.png"
			_, err := client.Edit(ctx, &msgs.EditRequest{
				HackathonId: createdHackathonID,
				Logo:        &initialLogo,
			})
			Expect(err).NotTo(HaveOccurred())

			// Now clear the logo
			emptyLogo := ""
			editResp, err := client.Edit(ctx, &msgs.EditRequest{
				HackathonId: createdHackathonID,
				Logo:        &emptyLogo,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(editResp.GetHackathon().GetLogo()).To(BeEmpty())
		})

		It("denies non-owner participant from editing", func() {
			// Create a user who is a participant but not an owner
			participantKeycloakID := "participant-editor"
			participantUser, err := dbClient.User.Create().
				SetKeycloakID(participantKeycloakID).
				SetUsername("participant-editor-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			_, err = dbClient.Participant.Create().
				SetHackathonID(uuid.MustParse(createdHackathonID)).
				SetUserID(participantUser.ID).
				SetIsWaiting(false).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(participantKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			newLogo := "https://example.com/hacked-logo.png"
			editReq := &msgs.EditRequest{
				HackathonId: createdHackathonID,
				Logo:        &newLogo,
			}

			_, err = client.Edit(ctx, editReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Authentication and RBAC", func() {
		Describe("Create permissions", func() {
			It("allows admin to create hackathons", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.CreateRequest{
					Name:       "Auth Test Hackathon",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				}

				resp, err := client.Create(ctx, req)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetHackathonId()).NotTo(BeEmpty())
			})

			It("denies non-admin users without roles from creating", func() {
				token := testutils.CreateTestJWTToken("non-admin-user")
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.CreateRequest{
					Name:       "Unauthorized Create",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				}

				resp, err := client.Create(ctx, req)
				Expect(err).To(HaveOccurred())
				Expect(resp).To(BeNil())

				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})

			It("denies anonymous requests from creating", func() {
				// No auth header
				ctx := context.Background()

				req := &msgs.CreateRequest{
					Name:       "Anonymous Create",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				}

				resp, err := client.Create(ctx, req)
				Expect(err).To(HaveOccurred())
				Expect(resp).To(BeNil())

				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})
		})

		Describe("List permissions", func() {
			It("allows authorized users to list public hackathons", func() {
				// List with authorized user - may be empty list if no hackathons exist
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.List(ctx, &msgs.ListRequest{})
				Expect(err).NotTo(HaveOccurred())
				// Should return empty list (not error) when no hackathons exist
				Expect(resp.GetHackathons()).To(BeEmpty())
			})

			It("allows anonymous users to list public hackathons but not private ones", func() {
				// No auth header - anonymous
				ctx := context.Background()

				// Create both public and private hackathons as admin
				adminToken := testutils.CreateTestJWTToken(testAdmin)
				adminCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+adminToken),
				)

				// Create public hackathon
				_, err := client.Create(adminCtx, &msgs.CreateRequest{
					Name:       "Public Hackathon",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				})
				Expect(err).NotTo(HaveOccurred())

				// Create private hackathon
				_, err = client.Create(adminCtx, &msgs.CreateRequest{
					Name:       "Private Hackathon",
					Visibility: entities.Visibility_VISIBILITY_PRIVATE,
				})
				Expect(err).NotTo(HaveOccurred())

				// Now list as anonymous - should only see public hackathons
				resp, err := client.List(ctx, &msgs.ListRequest{})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetHackathons()).NotTo(BeNil())
				Expect(resp.GetHackathons()).To(HaveLen(1), "should only list public hackathons")
				Expect(resp.GetHackathons()[0].GetName()).To(Equal("Public Hackathon"))
				Expect(
					resp.GetHackathons()[0].GetVisibility(),
				).To(Equal(entities.Visibility_VISIBILITY_PUBLIC))
			})
		})
	})

	Describe("EditCapability", func() {
		var (
			adminCtx    context.Context
			hackathonID string
		)

		// newUser inserts a user and returns a context carrying its token.
		newUser := func(username string) context.Context {
			keycloakID := "keycloak-" + username
			_, err := dbClient.User.Create().
				SetKeycloakID(keycloakID).
				SetUsername(username).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			return metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs(
					"authorization",
					"Bearer "+testutils.CreateTestJWTToken(keycloakID),
				),
			)
		}

		BeforeEach(func() {
			adminCtx = metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs(
					"authorization",
					"Bearer "+testutils.CreateTestJWTToken(testAdmin),
				),
			)

			now := time.Now()
			createResp, err := client.Create(adminCtx, &msgs.CreateRequest{
				Name:       "Capability Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()
		})

		It("reports a status for every capability on Get", func() {
			resp, err := client.Get(adminCtx, &msgs.GetRequest{HackathonId: hackathonID})
			Expect(err).NotTo(HaveOccurred())

			caps := resp.GetHackathon().GetCapabilities()
			Expect(caps).To(HaveLen(6))

			seen := map[entities.Capability]entities.CapabilityState{}
			for _, c := range caps {
				seen[c.GetCapability()] = c.GetState()
			}
			Expect(seen).To(HaveKey(entities.Capability_CAPABILITY_REGISTER))
			Expect(seen).To(HaveKey(entities.Capability_CAPABILITY_VOTE))
		})

		It("creates a new hackathon with every capability open", func() {
			// Introducing capabilities must not change behavior for existing
			// callers, so a fresh hackathon starts permissive.
			resp, err := client.Get(adminCtx, &msgs.GetRequest{HackathonId: hackathonID})
			Expect(err).NotTo(HaveOccurred())

			for _, c := range resp.GetHackathon().GetCapabilities() {
				Expect(c.GetState()).To(
					Equal(entities.CapabilityState_CAPABILITY_STATE_OPEN),
					"capability %v should start open", c.GetCapability(),
				)
			}
		})

		It("closes a capability and reports it back", func() {
			resp, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
				HackathonId: hackathonID,
				Capability:  entities.Capability_CAPABILITY_REGISTER,
				Enabled:     proto.Bool(false),
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetCapability().GetState()).To(
				Equal(entities.CapabilityState_CAPABILITY_STATE_CLOSED),
			)
		})

		It("blocks Join once registration is closed", func() {
			_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
				HackathonId: hackathonID,
				Capability:  entities.Capability_CAPABILITY_REGISTER,
				Enabled:     proto.Bool(false),
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = client.Join(newUser("late-joiner"), &msgs.JoinRequest{
				HackathonId: hackathonID,
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.FailedPrecondition))
			Expect(err.Error()).To(ContainSubstring("registrations are closed"))
		})

		It("still allows Join while registration is open", func() {
			_, err := client.Join(newUser("early-joiner"), &msgs.JoinRequest{
				HackathonId: hackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("lets an owner join even when registration is closed", func() {
			// Organizers must be able to act outside the window; a participant
			// who missed a deadline is a support request, not a lockout.
			_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
				HackathonId: hackathonID,
				Capability:  entities.Capability_CAPABILITY_REGISTER,
				Enabled:     proto.Bool(false),
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = client.Join(adminCtx, &msgs.JoinRequest{HackathonId: hackathonID})
			Expect(err).NotTo(HaveOccurred())
		})

		It("closes each capability independently", func() {
			_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
				HackathonId: hackathonID,
				Capability:  entities.Capability_CAPABILITY_VOTE,
				Enabled:     proto.Bool(false),
			})
			Expect(err).NotTo(HaveOccurred())

			resp, err := client.Get(adminCtx, &msgs.GetRequest{HackathonId: hackathonID})
			Expect(err).NotTo(HaveOccurred())

			for _, c := range resp.GetHackathon().GetCapabilities() {
				if c.GetCapability() == entities.Capability_CAPABILITY_VOTE {
					Expect(c.GetState()).To(
						Equal(entities.CapabilityState_CAPABILITY_STATE_CLOSED),
					)

					continue
				}
				Expect(c.GetState()).To(
					Equal(entities.CapabilityState_CAPABILITY_STATE_OPEN),
					"capability %v should be untouched", c.GetCapability(),
				)
			}
		})

		It("denies a non-owner from editing capabilities", func() {
			_, err := client.EditCapability(
				newUser("meddler"),
				&msgs.EditCapabilityRequest{
					HackathonId: hackathonID,
					Capability:  entities.Capability_CAPABILITY_REGISTER,
					Enabled:     proto.Bool(false),
				},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})

		It("rejects an unspecified capability", func() {
			_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
				HackathonId: hackathonID,
				Capability:  entities.Capability_CAPABILITY_UNSPECIFIED,
				Enabled:     proto.Bool(true),
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.InvalidArgument))
		})

		It("returns NOT_FOUND for an unknown hackathon", func() {
			_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
				HackathonId: uuid.NewString(),
				Capability:  entities.Capability_CAPABILITY_REGISTER,
				Enabled:     proto.Bool(false),
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(BeElementOf(codes.NotFound, codes.PermissionDenied))
		})

		Describe("phase schedule", func() {
			var adminUserID uuid.UUID

			BeforeEach(func() {
				u, err := dbClient.User.Query().
					Where(entuser.KeycloakIDEQ(testAdmin)).
					Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				adminUserID = u.ID
			})

			// phaseOn creates a phase on `onHackathon` starting `days` from now.
			phaseOn := func(onHackathon, name string, days int) *ent.Phase {
				p, err := dbClient.Phase.Create().
					SetName(name).
					SetStartsAt(time.Now().AddDate(0, 0, days)).
					SetEndsAt(time.Now().AddDate(0, 0, days+1)).
					SetHackathonID(uuid.MustParse(onHackathon)).
					SetCreatorID(adminUserID).
					SetModifierID(adminUserID).
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				return p
			}

			// newPhase creates a phase on the hackathon under test.
			newPhase := func(name string, days int) string {
				return phaseOn(hackathonID, name, days).ID.String()
			}

			// statusOf pulls one capability out of a Get response.
			statusOf := func(c entities.Capability) *entities.CapabilityStatus {
				resp, err := client.Get(adminCtx, &msgs.GetRequest{HackathonId: hackathonID})
				Expect(err).NotTo(HaveOccurred())
				for _, s := range resp.GetHackathon().GetCapabilities() {
					if s.GetCapability() == c {
						return s
					}
				}
				Fail("capability not present in Get response")

				return nil
			}

			It("reports COMING with an opens_at once linked to a future phase", func() {
				phaseID := newPhase("Proposals", 5)

				_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
					HackathonId:  hackathonID,
					Capability:   entities.Capability_CAPABILITY_SUBMIT_PROPOSAL,
					Enabled:      proto.Bool(false),
					OpensPhaseId: proto.String(phaseID),
				})
				Expect(err).NotTo(HaveOccurred())

				got := statusOf(entities.Capability_CAPABILITY_SUBMIT_PROPOSAL)
				Expect(got.GetState()).To(
					Equal(entities.CapabilityState_CAPABILITY_STATE_COMING),
				)
				Expect(got.GetOpensAt()).NotTo(BeNil())
				Expect(got.GetOpensPhaseId()).To(Equal(phaseID))
			})

			It("reports CLOSED when the linked phase has already started", func() {
				phaseID := newPhase("Past Proposals", -5)

				_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
					HackathonId:  hackathonID,
					Capability:   entities.Capability_CAPABILITY_SUBMIT_PROPOSAL,
					Enabled:      proto.Bool(false),
					OpensPhaseId: proto.String(phaseID),
				})
				Expect(err).NotTo(HaveOccurred())

				Expect(statusOf(entities.Capability_CAPABILITY_SUBMIT_PROPOSAL).GetState()).To(
					Equal(entities.CapabilityState_CAPABILITY_STATE_CLOSED),
				)
			})

			It("keeps a scheduled capability blocked for enforcement", func() {
				// COMING is a better message, not a weaker gate.
				phaseID := newPhase("Registration", 5)

				_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
					HackathonId:  hackathonID,
					Capability:   entities.Capability_CAPABILITY_REGISTER,
					Enabled:      proto.Bool(false),
					OpensPhaseId: proto.String(phaseID),
				})
				Expect(err).NotTo(HaveOccurred())

				_, err = client.Join(newUser("too-early"), &msgs.JoinRequest{
					HackathonId: hackathonID,
				})
				Expect(status.Code(err)).To(Equal(codes.FailedPrecondition))
			})

			It("lets the flag win over a future phase", func() {
				// The decisive property: an organizer opening something early is
				// not overruled by its schedule.
				phaseID := newPhase("Later", 5)

				_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
					HackathonId:  hackathonID,
					Capability:   entities.Capability_CAPABILITY_SUBMIT_PROPOSAL,
					Enabled:      proto.Bool(true),
					OpensPhaseId: proto.String(phaseID),
				})
				Expect(err).NotTo(HaveOccurred())

				Expect(statusOf(entities.Capability_CAPABILITY_SUBMIT_PROPOSAL).GetState()).To(
					Equal(entities.CapabilityState_CAPABILITY_STATE_OPEN),
				)
			})

			It("unlinks on an empty phase id", func() {
				phaseID := newPhase("Proposals", 5)
				_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
					HackathonId:  hackathonID,
					Capability:   entities.Capability_CAPABILITY_SUBMIT_PROPOSAL,
					Enabled:      proto.Bool(false),
					OpensPhaseId: proto.String(phaseID),
				})
				Expect(err).NotTo(HaveOccurred())

				_, err = client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
					HackathonId:  hackathonID,
					Capability:   entities.Capability_CAPABILITY_SUBMIT_PROPOSAL,
					OpensPhaseId: proto.String(""),
				})
				Expect(err).NotTo(HaveOccurred())

				got := statusOf(entities.Capability_CAPABILITY_SUBMIT_PROPOSAL)
				Expect(got.GetState()).To(
					Equal(entities.CapabilityState_CAPABILITY_STATE_CLOSED),
				)
				Expect(got.OpensAt).To(BeNil())
				Expect(got.OpensPhaseId).To(BeNil())
			})

			It("leaves the flag alone when only the schedule is edited", func() {
				phaseID := newPhase("Proposals", 5)

				// submit_proposal starts open; editing only the link must not
				// close it.
				_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
					HackathonId:  hackathonID,
					Capability:   entities.Capability_CAPABILITY_SUBMIT_PROPOSAL,
					OpensPhaseId: proto.String(phaseID),
				})
				Expect(err).NotTo(HaveOccurred())

				Expect(statusOf(entities.Capability_CAPABILITY_SUBMIT_PROPOSAL).GetState()).To(
					Equal(entities.CapabilityState_CAPABILITY_STATE_OPEN),
				)
			})

			It("rejects a phase belonging to another hackathon", func() {
				other, err := client.Create(adminCtx, &msgs.CreateRequest{
					Name:       "Other Hackathon",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				})
				Expect(err).NotTo(HaveOccurred())

				foreign := phaseOn(other.GetHackathonId(), "Foreign Phase", 5)

				_, err = client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
					HackathonId:  hackathonID,
					Capability:   entities.Capability_CAPABILITY_SUBMIT_PROPOSAL,
					OpensPhaseId: proto.String(foreign.ID.String()),
				})
				Expect(status.Code(err)).To(Equal(codes.NotFound))
			})

			Describe("AdvancePhase", func() {
				var ideation, hacking, judging string

				// stateOf reads one capability's state back from Get.
				stateOf := func(c entities.Capability) entities.CapabilityState {
					return statusOf(c).GetState()
				}

				BeforeEach(func() {
					ideation = newPhase("Ideation", 1)
					hacking = newPhase("Hacking", 2)
					judging = newPhase("Judging", 3)

					// Proposals span Ideation→Hacking, submissions Hacking→Judging,
					// results open at Judging. Voting stays unlinked. All start
					// closed so advancing is what opens them.
					for _, link := range []struct {
						capability    entities.Capability
						opens, closes string
					}{
						{entities.Capability_CAPABILITY_SUBMIT_PROPOSAL, ideation, hacking},
						{entities.Capability_CAPABILITY_SUBMIT_PROJECT, hacking, judging},
						{entities.Capability_CAPABILITY_VIEW_RESULTS, judging, ""},
					} {
						_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
							HackathonId:   hackathonID,
							Capability:    link.capability,
							Enabled:       proto.Bool(false),
							OpensPhaseId:  proto.String(link.opens),
							ClosesPhaseId: proto.String(link.closes),
						})
						Expect(err).NotTo(HaveOccurred())
					}
					_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
						HackathonId: hackathonID,
						Capability:  entities.Capability_CAPABILITY_VOTE,
						Enabled:     proto.Bool(false),
					})
					Expect(err).NotTo(HaveOccurred())
				})

				It("opens the capabilities scheduled for the target phase", func() {
					resp, err := client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID,
						PhaseId:     ideation,
					})
					Expect(err).NotTo(HaveOccurred())
					Expect(resp.GetCurrentPhaseId()).To(Equal(ideation))

					Expect(stateOf(entities.Capability_CAPABILITY_SUBMIT_PROPOSAL)).To(
						Equal(entities.CapabilityState_CAPABILITY_STATE_OPEN),
					)
				})

				It("closes what the previous phase opened when moving on", func() {
					_, err := client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID, PhaseId: ideation,
					})
					Expect(err).NotTo(HaveOccurred())

					_, err = client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID, PhaseId: hacking,
					})
					Expect(err).NotTo(HaveOccurred())

					Expect(stateOf(entities.Capability_CAPABILITY_SUBMIT_PROPOSAL)).To(
						Equal(entities.CapabilityState_CAPABILITY_STATE_CLOSED),
					)
					Expect(stateOf(entities.Capability_CAPABILITY_SUBMIT_PROJECT)).To(
						Equal(entities.CapabilityState_CAPABILITY_STATE_OPEN),
					)
				})

				It("leaves an unscheduled capability untouched", func() {
					// Voting must survive advancing in either direction — it opens
					// abruptly and by hand.
					for _, target := range []string{ideation, hacking, judging} {
						_, err := client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
							HackathonId: hackathonID, PhaseId: target,
						})
						Expect(err).NotTo(HaveOccurred())
						Expect(stateOf(entities.Capability_CAPABILITY_VOTE)).To(
							Equal(entities.CapabilityState_CAPABILITY_STATE_CLOSED),
						)
					}

					// And an organizer opening it by hand is not undone by a later
					// advance.
					_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
						HackathonId: hackathonID,
						Capability:  entities.Capability_CAPABILITY_VOTE,
						Enabled:     proto.Bool(true),
					})
					Expect(err).NotTo(HaveOccurred())

					_, err = client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID, PhaseId: ideation,
					})
					Expect(err).NotTo(HaveOccurred())
					Expect(stateOf(entities.Capability_CAPABILITY_VOTE)).To(
						Equal(entities.CapabilityState_CAPABILITY_STATE_OPEN),
					)
				})

				It("is idempotent", func() {
					// A double-click at a live event must be harmless.
					first, err := client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID, PhaseId: hacking,
					})
					Expect(err).NotTo(HaveOccurred())

					second, err := client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID, PhaseId: hacking,
					})
					Expect(err).NotTo(HaveOccurred())

					Expect(second.GetCurrentPhaseId()).To(Equal(first.GetCurrentPhaseId()))
					Expect(second.GetCapabilities()).To(HaveLen(len(first.GetCapabilities())))
				})

				It("restores the earlier flags when advancing backwards", func() {
					_, err := client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID, PhaseId: judging,
					})
					Expect(err).NotTo(HaveOccurred())
					Expect(stateOf(entities.Capability_CAPABILITY_SUBMIT_PROJECT)).To(
						Equal(entities.CapabilityState_CAPABILITY_STATE_CLOSED),
					)

					_, err = client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID, PhaseId: hacking,
					})
					Expect(err).NotTo(HaveOccurred())
					Expect(stateOf(entities.Capability_CAPABILITY_SUBMIT_PROJECT)).To(
						Equal(entities.CapabilityState_CAPABILITY_STATE_OPEN),
					)
				})

				It("reports the current phase on Get", func() {
					_, err := client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID, PhaseId: hacking,
					})
					Expect(err).NotTo(HaveOccurred())

					got, err := client.Get(adminCtx, &msgs.GetRequest{HackathonId: hackathonID})
					Expect(err).NotTo(HaveOccurred())
					Expect(got.GetHackathon().GetCurrentPhaseId()).To(Equal(hacking))
				})

				It("denies a non-owner", func() {
					_, err := client.AdvancePhase(
						newUser("bystander"),
						&msgs.AdvancePhaseRequest{
							HackathonId: hackathonID, PhaseId: ideation,
						},
					)
					Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
				})

				It("rejects a phase from another hackathon", func() {
					other, err := client.Create(adminCtx, &msgs.CreateRequest{
						Name:       "Elsewhere",
						Visibility: entities.Visibility_VISIBILITY_PUBLIC,
					})
					Expect(err).NotTo(HaveOccurred())
					foreign := phaseOn(other.GetHackathonId(), "Foreign", 1)

					_, err = client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID, PhaseId: foreign.ID.String(),
					})
					Expect(status.Code(err)).To(Equal(codes.NotFound))
				})

				It("clears the current phase when that phase is deleted", func() {
					_, err := client.AdvancePhase(adminCtx, &msgs.AdvancePhaseRequest{
						HackathonId: hackathonID, PhaseId: hacking,
					})
					Expect(err).NotTo(HaveOccurred())

					Expect(dbClient.Phase.DeleteOneID(uuid.MustParse(hacking)).
						Exec(context.Background())).To(Succeed())

					got, err := client.Get(adminCtx, &msgs.GetRequest{HackathonId: hackathonID})
					Expect(err).NotTo(HaveOccurred())
					Expect(got.GetHackathon().CurrentPhaseId).To(BeNil())
				})
			})

			It("survives deletion of the linked phase", func() {
				phaseID := newPhase("Doomed", 5)
				_, err := client.EditCapability(adminCtx, &msgs.EditCapabilityRequest{
					HackathonId:  hackathonID,
					Capability:   entities.Capability_CAPABILITY_SUBMIT_PROPOSAL,
					Enabled:      proto.Bool(false),
					OpensPhaseId: proto.String(phaseID),
				})
				Expect(err).NotTo(HaveOccurred())

				// The owner UI can delete phases; that must not take the
				// capability with it.
				Expect(dbClient.Phase.DeleteOneID(uuid.MustParse(phaseID)).
					Exec(context.Background())).To(Succeed())

				got := statusOf(entities.Capability_CAPABILITY_SUBMIT_PROPOSAL)
				Expect(got.GetState()).To(
					Equal(entities.CapabilityState_CAPABILITY_STATE_CLOSED),
				)
				Expect(got.OpensPhaseId).To(BeNil())
			})
		})
	})

})
