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
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathonstate "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonstate"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	phaseMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/phase_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

// getCapabilityEnabled finds a capability's enabled state from a slice of CapabilityState.
func getCapabilityEnabled(caps []*entities.CapabilityState, cap entities.Capability) bool {
	for _, c := range caps {
		if c.GetCapability() == cap {
			return c.GetEnabled()
		}
	}
	return false
}

var _ = Describe("HackathonService", func() {

	var (
		dbClient    *ent.Client
		conn        *grpc.ClientConn
		client      hackathonSvc.HackathonServiceClient
		phaseClient hackathonSvc.PhaseServiceClient
		enf         *middleware.Enforcer
		testAdmin   string
	)

	BeforeEach(func() {
		dbClient, conn, enf = testutils.CreateTestServer()
		testAdmin = testutils.TestAdminKeycloakID

		client = hackathonSvc.NewHackathonServiceClient(conn)
		phaseClient = hackathonSvc.NewPhaseServiceClient(conn)
	})

	Describe("Create", func() {
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

			// Enable registrations via SetCapabilities
			_, err = client.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: createdHackathonID,
				Capabilities: []*msgs.CapabilityState{
					{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
				},
			})
			Expect(err).NotTo(HaveOccurred())
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
				entparticipant.UserID(user.ID),
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

		It("returns FAILED_PRECONDITION when registrations are disabled", func() {
			// Disable registrations via admin
			adminToken := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+adminToken),
			)
			_, err := client.SetCapabilities(adminCtx, &msgs.SetCapabilitiesRequest{
				HackathonId: createdHackathonID,
				Capabilities: []*msgs.CapabilityState{
					{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: false},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			// Try to join as non-admin
			nonAdminKeycloakID := "non-admin-join"
			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("test-join-user-3").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			joinReq := &msgs.JoinRequest{HackathonId: createdHackathonID}
			_, err = client.Join(ctx, joinReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
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

	Describe("HackathonState", func() {
		var createdHackathonID string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &msgs.CreateRequest{
				Name:       "Settings Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
			}

			createResp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createResp.GetHackathonId()
		})

		Describe("Create creates default state", func() {
			It("creates state with all capabilities disabled by default", func() {
				// Verify state exists in database with defaults
				state, err := dbClient.HackathonState.Query().
					Where(enthackathonstate.HasHackathonWith(
						enthackathon.IDEQ(uuid.MustParse(createdHackathonID)),
					)).Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				Expect(state.RegistrationsEnabled).To(BeFalse())
				Expect(state.VotingEnabled).To(BeFalse())
				Expect(state.ProposeProjectsEnabled).To(BeFalse())
				Expect(state.SetTeamPreferencesEnabled).To(BeFalse())
				Expect(state.CreateProjectSubmissionsEnabled).To(BeFalse())
				Expect(state.ViewResultsEnabled).To(BeFalse())
			})
		})

		Describe("Get returns state", func() {
			It("includes state in Get response", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				getReq := &msgs.GetRequest{HackathonId: createdHackathonID}
				getResp, err := client.Get(ctx, getReq)
				Expect(err).NotTo(HaveOccurred())

				h := getResp.GetHackathon()
				Expect(h.GetState()).NotTo(BeNil())
				state := h.GetState()
				Expect(state.GetId()).NotTo(BeEmpty())
				Expect(state.GetModifiedAt()).NotTo(BeNil())

				// All capabilities should be disabled
				Expect(
					getCapabilityEnabled(
						state.GetCapabilities(),
						entities.Capability_CAPABILITY_REGISTER,
					),
				).To(BeFalse())
				Expect(
					getCapabilityEnabled(
						state.GetCapabilities(),
						entities.Capability_CAPABILITY_VOTE,
					),
				).To(BeFalse())
				Expect(
					getCapabilityEnabled(
						state.GetCapabilities(),
						entities.Capability_CAPABILITY_PROPOSE_PROJECTS,
					),
				).To(BeFalse())
				Expect(
					getCapabilityEnabled(
						state.GetCapabilities(),
						entities.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
					),
				).To(BeFalse())
				Expect(
					getCapabilityEnabled(
						state.GetCapabilities(),
						entities.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
					),
				).To(BeFalse())
				Expect(
					getCapabilityEnabled(
						state.GetCapabilities(),
						entities.Capability_CAPABILITY_VIEW_RESULTS,
					),
				).To(BeFalse())
			})
		})

		Describe("SetCapabilities", func() {
			It("enables registrations", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
					},
				}

				resp, err := client.SetCapabilities(ctx, req)
				Expect(err).NotTo(HaveOccurred())
				Expect(
					getCapabilityEnabled(
						resp.GetState().GetCapabilities(),
						entities.Capability_CAPABILITY_REGISTER,
					),
				).To(BeTrue())
				Expect(
					getCapabilityEnabled(
						resp.GetState().GetCapabilities(),
						entities.Capability_CAPABILITY_VOTE,
					),
				).To(BeFalse())

				// Verify in database
				state, err := dbClient.HackathonState.Query().
					Where(enthackathonstate.HasHackathonWith(
						enthackathon.IDEQ(uuid.MustParse(createdHackathonID)),
					)).Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				Expect(state.RegistrationsEnabled).To(BeTrue())
				Expect(state.VotingEnabled).To(BeFalse())
			})

			It("enables multiple capabilities at once", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
						{Capability: entities.Capability_CAPABILITY_VOTE, Enabled: true},
					},
				}

				resp, err := client.SetCapabilities(ctx, req)
				Expect(err).NotTo(HaveOccurred())
				Expect(
					getCapabilityEnabled(
						resp.GetState().GetCapabilities(),
						entities.Capability_CAPABILITY_REGISTER,
					),
				).To(BeTrue())
				Expect(
					getCapabilityEnabled(
						resp.GetState().GetCapabilities(),
						entities.Capability_CAPABILITY_VOTE,
					),
				).To(BeTrue())
				Expect(
					getCapabilityEnabled(
						resp.GetState().GetCapabilities(),
						entities.Capability_CAPABILITY_PROPOSE_PROJECTS,
					),
				).To(BeFalse())
			})

			It("disables previously enabled capabilities", func() {
				// First enable registrations
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)
				_, err := client.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
					},
				})
				Expect(err).NotTo(HaveOccurred())

				// Now disable it
				resp, err := client.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: false},
					},
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(
					getCapabilityEnabled(
						resp.GetState().GetCapabilities(),
						entities.Capability_CAPABILITY_REGISTER,
					),
				).To(BeFalse())
			})

			It("returns NOT_FOUND for invalid hackathon ID", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.SetCapabilitiesRequest{
					HackathonId: uuid.NewString(),
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
					},
				}

				_, err := client.SetCapabilities(ctx, req)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("returns error for UNSPECIFIED capability", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_UNSPECIFIED, Enabled: true},
					},
				}

				_, err := client.SetCapabilities(ctx, req)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.InvalidArgument))
			})

			It("requires Write permission", func() {
				nonOwnerKeycloakID := "non-owner-settings"
				_, err := dbClient.User.Create().
					SetKeycloakID(nonOwnerKeycloakID).
					SetUsername("non-owner-settings-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
					},
				}

				_, err = client.SetCapabilities(ctx, req)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})

			It("denies anonymous users", func() {
				req := &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
					},
				}

				_, err := client.SetCapabilities(context.Background(), req)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})

			It("returns state with modified_at timestamp", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
					},
				}

				resp, err := client.SetCapabilities(ctx, req)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetState().GetModifiedAt()).NotTo(BeNil())
			})
		})
	})

	Describe("SetCurrentPhase", func() {
		var createdHackathonID string
		var createdPhaseID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &msgs.CreateRequest{
				Name:       "Phase Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
			}

			createResp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createResp.GetHackathonId()

			// Create a user for phase creator/modifier
			phaseUser, err := dbClient.User.Create().
				SetKeycloakID("phase-test-user").
				SetUsername("phase-test-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Create a phase
			phase, err := dbClient.Phase.Create().
				SetHackathonID(uuid.MustParse(createdHackathonID)).
				SetName("Registration Phase").
				SetCreatorID(phaseUser.ID).
				SetModifierID(phaseUser.ID).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
			createdPhaseID = phase.ID.String()
		})

		It("sets current phase successfully", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			req := &msgs.SetCurrentPhaseRequest{
				HackathonId: createdHackathonID,
				PhaseId:     createdPhaseID,
			}

			resp, err := client.SetCurrentPhase(ctx, req)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetState().GetCurrentPhaseId()).To(Equal(createdPhaseID))

			// Verify in database
			state, err := dbClient.HackathonState.Query().
				Where(enthackathonstate.HasHackathonWith(
					enthackathon.IDEQ(uuid.MustParse(createdHackathonID)),
				)).Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(state.CurrentPhaseID.String()).To(Equal(createdPhaseID))
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			req := &msgs.SetCurrentPhaseRequest{
				HackathonId: uuid.NewString(),
				PhaseId:     createdPhaseID,
			}

			_, err := client.SetCurrentPhase(ctx, req)
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND for phase not belonging to hackathon", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create a user for hackathon/phase creator
			otherUser, err := dbClient.User.Create().
				SetKeycloakID("other-phase-user").
				SetUsername("other-phase-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Create a phase in a different hackathon
			otherHackathon, err := dbClient.Hackathon.Create().
				SetName("Other Hackathon").
				SetVisibility(enthackathon.VisibilityPublic).
				SetCreatorID(otherUser.ID).
				SetModifierID(otherUser.ID).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			otherPhase, err := dbClient.Phase.Create().
				SetHackathonID(otherHackathon.ID).
				SetName("Other Phase").
				SetCreatorID(otherUser.ID).
				SetModifierID(otherUser.ID).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			req := &msgs.SetCurrentPhaseRequest{
				HackathonId: createdHackathonID,
				PhaseId:     otherPhase.ID.String(),
			}

			_, err = client.SetCurrentPhase(ctx, req)
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission", func() {
			nonOwnerKeycloakID := "non-owner-phase"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-phase-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			req := &msgs.SetCurrentPhaseRequest{
				HackathonId: createdHackathonID,
				PhaseId:     createdPhaseID,
			}

			_, err = client.SetCurrentPhase(ctx, req)
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("denies anonymous users", func() {
			req := &msgs.SetCurrentPhaseRequest{
				HackathonId: createdHackathonID,
				PhaseId:     createdPhaseID,
			}

			_, err := client.SetCurrentPhase(context.Background(), req)
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("returns state with modified_at timestamp", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			req := &msgs.SetCurrentPhaseRequest{
				HackathonId: createdHackathonID,
				PhaseId:     createdPhaseID,
			}

			resp, err := client.SetCurrentPhase(ctx, req)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetState().GetModifiedAt()).NotTo(BeNil())
		})

		It("clears current phase when phase_id is empty", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First set a current phase
			_, err := client.SetCurrentPhase(ctx, &msgs.SetCurrentPhaseRequest{
				HackathonId: createdHackathonID,
				PhaseId:     createdPhaseID,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify it was set
			state, err := dbClient.HackathonState.Query().
				Where(enthackathonstate.HasHackathonWith(
					enthackathon.IDEQ(uuid.MustParse(createdHackathonID)),
				)).Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(state.CurrentPhaseID.String()).To(Equal(createdPhaseID))

			// Clear the current phase
			resp, err := client.SetCurrentPhase(ctx, &msgs.SetCurrentPhaseRequest{
				HackathonId: createdHackathonID,
				PhaseId:     "",
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetState().GetCurrentPhaseId()).To(BeEmpty())

			// Verify it was cleared
			state, err = dbClient.HackathonState.Query().
				Where(enthackathonstate.HasHackathonWith(
					enthackathon.IDEQ(uuid.MustParse(createdHackathonID)),
				)).Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(state.CurrentPhaseID).To(Equal(uuid.Nil))
		})

		It("returns NOT_FOUND for phase from different hackathon (created via gRPC)", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create a phase in a different hackathon via gRPC
			otherHackathonResp, err := client.Create(ctx, &msgs.CreateRequest{
				Name:       "Other Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
			})
			Expect(err).NotTo(HaveOccurred())

			otherPhaseResp, err := phaseClient.Create(ctx, &phaseMsgs.CreateRequest{
				HackathonId: otherHackathonResp.GetHackathonId(),
				Name:        "Other Phase",
				Description: "A phase in another hackathon",
			})
			Expect(err).NotTo(HaveOccurred())

			// Try to set it as current phase on the original hackathon
			req := &msgs.SetCurrentPhaseRequest{
				HackathonId: createdHackathonID,
				PhaseId:     otherPhaseResp.GetPhaseId(),
			}

			_, err = client.SetCurrentPhase(ctx, req)
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})
	})

	Describe("Capability-based permission gating", func() {
		var createdHackathonID string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &msgs.CreateRequest{
				Name:       "Permission Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(time.Now().Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(time.Now().Add(48 * time.Hour)),
			}

			createResp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createResp.GetHackathonId()
		})

		Describe("Join requires register capability", func() {
			It("allows join when register capability is enabled", func() {
				// Enable register capability
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)
				_, err := client.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
					},
				})
				Expect(err).NotTo(HaveOccurred())

				// Create user and join
				nonAdminKeycloakID := "join-cap-test"
				_, err = dbClient.User.Create().
					SetKeycloakID(nonAdminKeycloakID).
					SetUsername("join-cap-user").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token = testutils.CreateTestJWTToken(nonAdminKeycloakID)
				ctx = metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				joinReq := &msgs.JoinRequest{HackathonId: createdHackathonID}
				_, err = client.Join(ctx, joinReq)
				Expect(err).NotTo(HaveOccurred())
			})

			It("denies join when register capability is disabled", func() {
				// Register is disabled by default
				nonAdminKeycloakID := "join-cap-disabled"
				_, err := dbClient.User.Create().
					SetKeycloakID(nonAdminKeycloakID).
					SetUsername("join-cap-disabled-user").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				joinReq := &msgs.JoinRequest{HackathonId: createdHackathonID}
				_, err = client.Join(ctx, joinReq)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})
		})

		Describe("Empty capabilities map is no-op", func() {
			It("returns current state when capabilities map is empty", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.SetCapabilitiesRequest{
					HackathonId:  createdHackathonID,
					Capabilities: []*msgs.CapabilityState{},
				}

				resp, err := client.SetCapabilities(ctx, req)
				Expect(err).NotTo(HaveOccurred())
				Expect(
					getCapabilityEnabled(
						resp.GetState().GetCapabilities(),
						entities.Capability_CAPABILITY_REGISTER,
					),
				).To(BeFalse())
			})
		})
	})

	Describe("AddOwner", func() {
		var createdHackathonID string
		var newUser *ent.User

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &msgs.CreateRequest{
				Name:       "AddOwner Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
			}

			createResp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createResp.GetHackathonId()

			// Create a user to be added as owner
			newUser, err = dbClient.User.Create().
				SetKeycloakID("add-owner-test-user").
				SetUsername("add-owner-test-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
		})

		It("allows owner to add another owner", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			addReq := &msgs.AddOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      newUser.ID.String(),
			}

			_, err := client.AddOwner(ctx, addReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify user is now in the owners edge
			h, err := dbClient.Hackathon.Query().
				Where(enthackathon.IDEQ(uuid.MustParse(createdHackathonID))).
				WithOwners().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(h.Edges.Owners).To(HaveLen(2)) // creator + new owner

			// Verify casbin role was granted (owner can read hackathon)
			ok, err := enf.CheckPermission(
				newUser.KeycloakID,
				createdHackathonID,
				middleware.Hackathon,
				middleware.Read,
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(ok).To(BeTrue())
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			addReq := &msgs.AddOwnerRequest{
				HackathonId: uuid.NewString(),
				UserId:      newUser.ID.String(),
			}

			_, err := client.AddOwner(ctx, addReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND for non-existent user", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			addReq := &msgs.AddOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      uuid.NewString(),
			}

			_, err := client.AddOwner(ctx, addReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns invalid argument for malformed user ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			addReq := &msgs.AddOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      "not-a-uuid",
			}

			_, err := client.AddOwner(ctx, addReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("returns invalid argument for malformed hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			addReq := &msgs.AddOwnerRequest{
				HackathonId: "not-a-uuid",
				UserId:      newUser.ID.String(),
			}

			_, err := client.AddOwner(ctx, addReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("requires Write permission to add owner", func() {
			// Use a user who is not an owner/organizer
			nonOwnerKeycloakID := "non-owner-add"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-add-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			addReq := &msgs.AddOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      newUser.ID.String(),
			}

			_, err = client.AddOwner(ctx, addReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("denies anonymous users", func() {
			addReq := &msgs.AddOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      newUser.ID.String(),
			}

			_, err := client.AddOwner(context.Background(), addReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.Unauthenticated))
		})

		It("returns owner in Get response after adding", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			addReq := &msgs.AddOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      newUser.ID.String(),
			}

			_, err := client.AddOwner(ctx, addReq)
			Expect(err).NotTo(HaveOccurred())

			// Get hackathon and verify owners are listed
			getReq := &msgs.GetRequest{HackathonId: createdHackathonID}
			getResp, err := client.Get(ctx, getReq)
			Expect(err).NotTo(HaveOccurred())

			h := getResp.GetHackathon()
			Expect(h.GetOwners()).To(HaveLen(2))

			// Verify both the creator and the new owner are present
			ownerKeycloakIDs := make(map[string]bool)
			for _, o := range h.GetOwners() {
				ownerKeycloakIDs[o.GetKeycloakId()] = true
			}
			Expect(ownerKeycloakIDs).To(HaveKey(testAdmin))
			Expect(ownerKeycloakIDs).To(HaveKey(newUser.KeycloakID))
		})
	})

	Describe("RemoveOwner", func() {
		var createdHackathonID string
		var ownerToRemove *ent.User

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &msgs.CreateRequest{
				Name:       "RemoveOwner Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
			}

			createResp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createResp.GetHackathonId()

			// Create a user and add them as owner
			ownerToRemove, err = dbClient.User.Create().
				SetKeycloakID("remove-owner-test-user").
				SetUsername("remove-owner-test-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			addReq := &msgs.AddOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      ownerToRemove.ID.String(),
			}

			_, err = client.AddOwner(ctx, addReq)
			Expect(err).NotTo(HaveOccurred())
		})

		It("allows owner to remove another owner", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			removeReq := &msgs.RemoveOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      ownerToRemove.ID.String(),
			}

			_, err := client.RemoveOwner(ctx, removeReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify user is no longer in the owners edge
			h, err := dbClient.Hackathon.Query().
				Where(enthackathon.IDEQ(uuid.MustParse(createdHackathonID))).
				WithOwners().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(h.Edges.Owners).To(HaveLen(1)) // only creator remains

			// Verify casbin role was revoked (owner can no longer read hackathon)
			ok, err := enf.CheckPermission(
				ownerToRemove.KeycloakID,
				createdHackathonID,
				middleware.Hackathon,
				middleware.Read,
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(ok).To(BeFalse())
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			removeReq := &msgs.RemoveOwnerRequest{
				HackathonId: uuid.NewString(),
				UserId:      ownerToRemove.ID.String(),
			}

			_, err := client.RemoveOwner(ctx, removeReq)
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

			removeReq := &msgs.RemoveOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      uuid.NewString(),
			}

			_, err := client.RemoveOwner(ctx, removeReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND when user is not an owner", func() {
			// Create a user who is not an owner
			nonOwner, err := dbClient.User.Create().
				SetKeycloakID("not-an-owner").
				SetUsername("not-an-owner-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			removeReq := &msgs.RemoveOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      nonOwner.ID.String(),
			}

			_, err = client.RemoveOwner(ctx, removeReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns FAILED_PRECONDITION when removing the last owner", func() {
			// The hackathon only has the creator as owner.
			// Try to remove the creator (who is also an owner via the Owners edge).
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			// remove other owner
			removeReq := &msgs.RemoveOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      ownerToRemove.ID.String(),
			}

			_, err := client.RemoveOwner(ctx, removeReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify creator is in the Owners edge
			h, err := dbClient.Hackathon.Query().
				Where(enthackathon.IDEQ(uuid.MustParse(createdHackathonID))).
				WithOwners().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(h.Edges.Owners).To(HaveLen(1))

			// Try to remove the creator
			removeReq = &msgs.RemoveOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      h.Edges.Owners[0].ID.String(),
			}

			_, err = client.RemoveOwner(ctx, removeReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.FailedPrecondition))
		})

		It("returns invalid argument for malformed user ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			removeReq := &msgs.RemoveOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      "not-a-uuid",
			}

			_, err := client.RemoveOwner(ctx, removeReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("returns invalid argument for malformed hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			removeReq := &msgs.RemoveOwnerRequest{
				HackathonId: "not-a-uuid",
				UserId:      ownerToRemove.ID.String(),
			}

			_, err := client.RemoveOwner(ctx, removeReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("requires Write permission to remove owner", func() {
			// Create a user who is a participant but not an owner
			participantKeycloakID := "participant-remover"
			participantUser, err := dbClient.User.Create().
				SetKeycloakID(participantKeycloakID).
				SetUsername("participant-remover-username").
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

			removeReq := &msgs.RemoveOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      ownerToRemove.ID.String(),
			}

			_, err = client.RemoveOwner(ctx, removeReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("denies anonymous users", func() {
			removeReq := &msgs.RemoveOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      ownerToRemove.ID.String(),
			}

			_, err := client.RemoveOwner(context.Background(), removeReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.Unauthenticated))
		})

		It("allows removing all non-creator owners, leaving only the creator", func() {
			// Add a second owner
			secondOwner, err := dbClient.User.Create().
				SetKeycloakID("second-owner").
				SetUsername("second-owner-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = client.AddOwner(ctx, &msgs.AddOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      secondOwner.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify two owners exist
			h, err := dbClient.Hackathon.Query().
				Where(enthackathon.IDEQ(uuid.MustParse(createdHackathonID))).
				WithOwners().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(h.Edges.Owners).To(HaveLen(3))

			// Remove the first added owner
			_, err = client.RemoveOwner(ctx, &msgs.RemoveOwnerRequest{
				HackathonId: createdHackathonID,
				UserId:      ownerToRemove.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify one owner remains
			h, err = dbClient.Hackathon.Query().
				Where(enthackathon.IDEQ(uuid.MustParse(createdHackathonID))).
				WithOwners().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(h.Edges.Owners).To(HaveLen(2))
		})
	})
})
