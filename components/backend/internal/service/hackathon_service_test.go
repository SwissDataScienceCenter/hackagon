//go:build test && unittest

package service_test

import (
	"context"
	"fmt"
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
	entanswer "github.com/swissdatasciencecenter/hackagon/components/backend/ent/answer"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathoninvite "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathoninvite"
	enthackathonstate "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonstate"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entquestion "github.com/swissdatasciencecenter/hackagon/components/backend/ent/question"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
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

		It("upserts answers when user joins twice with different answers", func() {
			// Create a question first
			token := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			qResp, err := client.CreateQuestion(adminCtx, &msgs.CreateQuestionRequest{
				HackathonId: createdHackathonID,
				Key:         "company",
				Label:       "Company",
				Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
				Mandatory:   true,
				Order:       1,
			})
			Expect(err).NotTo(HaveOccurred())
			questionID := qResp.GetQuestionId()

			// Create a user
			joinUserKeycloakID := "join-upsert-user"
			joinUser, err := dbClient.User.Create().
				SetKeycloakID(joinUserKeycloakID).
				SetUsername("join-upsert-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Join first time with answer "Acme Corp"
			joinToken := testutils.CreateTestJWTToken(joinUserKeycloakID)
			joinCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+joinToken),
			)
			_, err = client.Join(joinCtx, &msgs.JoinRequest{
				HackathonId: createdHackathonID,
				Answers: []*entities.Answer{
					{
						QuestionId: questionID,
						Value:      &entities.Answer_TextValue{TextValue: "Acme Corp"},
					},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify first answer
			answers, err := dbClient.Answer.Query().
				Where(
					entanswer.QuestionIDEQ(uuid.MustParse(questionID)),
					entanswer.UserID(joinUser.ID),
				).All(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(answers).To(HaveLen(1))
			Expect(answers[0].Value).To(Equal("Acme Corp"))

			// Join again with different answer "Globex Inc"
			_, err = client.Join(joinCtx, &msgs.JoinRequest{
				HackathonId: createdHackathonID,
				Answers: []*entities.Answer{
					{
						QuestionId: questionID,
						Value:      &entities.Answer_TextValue{TextValue: "Globex Inc"},
					},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify answer was upserted (not duplicated)
			answers, err = dbClient.Answer.Query().
				Where(
					entanswer.QuestionIDEQ(uuid.MustParse(questionID)),
					entanswer.UserID(joinUser.ID),
				).All(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(answers).To(HaveLen(1), "should have exactly one answer, not duplicate")
			Expect(
				answers[0].Value,
			).To(Equal("Globex Inc"), "answer should be updated to new value")
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
				Expect(state.ViewTeamsEnabled).To(BeFalse())
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
				Expect(
					getCapabilityEnabled(
						state.GetCapabilities(),
						entities.Capability_CAPABILITY_VIEW_TEAMS,
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

			It("enables view_teams and grants Team:read to members", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_VIEW_TEAMS, Enabled: true},
					},
				}

				resp, err := client.SetCapabilities(ctx, req)
				Expect(err).NotTo(HaveOccurred())
				Expect(
					getCapabilityEnabled(
						resp.GetState().GetCapabilities(),
						entities.Capability_CAPABILITY_VIEW_TEAMS,
					),
				).To(BeTrue())

				// Verify in database
				state, err := dbClient.HackathonState.Query().
					Where(enthackathonstate.HasHackathonWith(
						enthackathon.IDEQ(uuid.MustParse(createdHackathonID)),
					)).Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				Expect(state.ViewTeamsEnabled).To(BeTrue())
			})

			It("disables view_teams and revokes Team:read from members", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// First enable
				_, err := client.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_VIEW_TEAMS, Enabled: true},
					},
				})
				Expect(err).NotTo(HaveOccurred())

				// Now disable
				resp, err := client.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
					HackathonId: createdHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_VIEW_TEAMS, Enabled: false},
					},
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(
					getCapabilityEnabled(
						resp.GetState().GetCapabilities(),
						entities.Capability_CAPABILITY_VIEW_TEAMS,
					),
				).To(BeFalse())

				// Verify in database
				state, err := dbClient.HackathonState.Query().
					Where(enthackathonstate.HasHackathonWith(
						enthackathon.IDEQ(uuid.MustParse(createdHackathonID)),
					)).Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				Expect(state.ViewTeamsEnabled).To(BeFalse())
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

			// Verify casbin role was revoked (owner can no longer write hackathon)
			ok, err := enf.CheckPermission(
				ownerToRemove.KeycloakID,
				createdHackathonID,
				middleware.Hackathon,
				middleware.Write,
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
	Describe("RegistrationForm", func() {

		var (
			hackathonID string
		)
		BeforeEach(func() {

			// Create a hackathon for tests
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createResp, err := client.Create(ctx, &msgs.CreateRequest{
				Name:       "QA Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()
		})
		Describe("CreateQuestion", func() {
			It("creates a text question successfully", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "company",
					Label:       "Your company",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Mandatory:   true,
					Order:       1,
				}

				resp, err := client.CreateQuestion(ctx, req)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetQuestionId()).NotTo(BeEmpty())

				// Verify in database
				q, err := dbClient.Question.Query().
					Where(
						entquestion.IDEQ(uuid.MustParse(resp.GetQuestionId())),
						entquestion.HackathonIDEQ(uuid.MustParse(hackathonID)),
					).Only(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(q.Key).To(Equal("company"))
				Expect(q.Label).To(Equal("Your company"))
				Expect(q.DataType).To(Equal(entquestion.DataTypeText))
				Expect(q.Mandatory).To(BeTrue())
				Expect(q.Order).To(Equal(1))
				Expect(q.PublicAnswers).To(BeFalse())
			})

			It("creates a bool question", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "agree_terms",
					Label:       "I agree to the terms",
					Type:        entities.QuestionType_QUESTION_TYPE_BOOL,
					Mandatory:   false,
					Order:       2,
				}

				resp, err := client.CreateQuestion(ctx, req)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetQuestionId()).NotTo(BeEmpty())

				q, err := dbClient.Question.Query().
					Where(
						entquestion.IDEQ(uuid.MustParse(resp.GetQuestionId())),
						entquestion.HackathonIDEQ(uuid.MustParse(hackathonID)),
					).Only(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(q.DataType).To(Equal(entquestion.DataTypeBool))
				Expect(q.Mandatory).To(BeFalse())
			})

			It("creates multiple questions with different orders", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				keys := []string{"q1", "q2", "q3"}
				orders := []int32{10, 5, 1}
				for i, key := range keys {
					req := &msgs.CreateQuestionRequest{
						HackathonId: hackathonID,
						Key:         key,
						Label:       fmt.Sprintf("Question %d", i+1),
						Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
						Order:       orders[i],
					}
					_, err := client.CreateQuestion(ctx, req)
					Expect(err).NotTo(HaveOccurred())
				}

				// Verify all exist
				questions, err := dbClient.Question.Query().
					Where(entquestion.HackathonIDEQ(uuid.MustParse(hackathonID))).
					Order(ent.Asc(entquestion.FieldOrder)).
					All(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(questions).To(HaveLen(3))
				Expect(questions[0].Order).To(Equal(int(orders[2]))) // order 1 first
				Expect(questions[1].Order).To(Equal(int(orders[1]))) // order 5
				Expect(questions[2].Order).To(Equal(int(orders[0]))) // order 10
			})

			It("returns ALREADY_EXISTS for duplicate key", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "company",
					Label:       "Your company",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Mandatory:   true,
					Order:       1,
				}
				_, err := client.CreateQuestion(ctx, req)
				Expect(err).NotTo(HaveOccurred())

				// Duplicate key should fail
				dupReq := &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "company",
					Label:       "Duplicate",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Order:       2,
				}
				_, err = client.CreateQuestion(ctx, dupReq)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.AlreadyExists))
			})

			It("returns NOT_FOUND for invalid hackathon ID", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.CreateQuestionRequest{
					HackathonId: uuid.NewString(),
					Key:         "company",
					Label:       "Your company",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Order:       1,
				}
				_, err := client.CreateQuestion(ctx, req)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("requires Write permission", func() {
				nonOwnerKeycloakID := "non-owner-question"
				_, err := dbClient.User.Create().
					SetKeycloakID(nonOwnerKeycloakID).
					SetUsername("non-owner-question-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				req := &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "company",
					Label:       "Your company",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Order:       1,
				}
				_, err = client.CreateQuestion(ctx, req)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})

			It("denies anonymous users", func() {
				req := &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "company",
					Label:       "Your company",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Order:       1,
				}
				_, err := client.CreateQuestion(context.Background(), req)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})
		})

		// --- ListQuestions ---

		Describe("ListQuestions", func() {
			// Regression: this required `hackathon:read`, which a non-member does
			// not hold. Join validates the mandatory answers and answering needs
			// the questions, so a hackathon asking anything mandatory could not be
			// joined by anyone at all.
			It("serves a non-member, so signup is not deadlocked", func() {
				_, err := dbClient.User.Create().
					SetKeycloakID("lq-outsider").
					SetUsername("lq-outsider").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				outsiderCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs(
						"authorization",
						"Bearer "+testutils.CreateTestJWTToken("lq-outsider"),
					),
				)
				resp, err := client.ListQuestions(outsiderCtx, &msgs.ListQuestionsRequest{
					HackathonId: hackathonID,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetQuestions()).NotTo(BeEmpty())
			})

			BeforeEach(func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				questions := []struct {
					key   string
					label string
					typ   entities.QuestionType
					order int32
				}{
					{"company", "Your company", entities.QuestionType_QUESTION_TYPE_TEXT, 10},
					{
						"agree_terms",
						"I agree to terms",
						entities.QuestionType_QUESTION_TYPE_BOOL,
						1,
					},
					{
						"dietary",
						"Dietary requirements",
						entities.QuestionType_QUESTION_TYPE_TEXT,
						5,
					},
				}

				for _, q := range questions {
					_, err := client.CreateQuestion(ctx, &msgs.CreateQuestionRequest{
						HackathonId: hackathonID,
						Key:         q.key,
						Label:       q.label,
						Type:        q.typ,
						Order:       q.order,
					})
					Expect(err).NotTo(HaveOccurred())
				}
			})

			It("returns questions ordered by order field", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.ListQuestions(ctx, &msgs.ListQuestionsRequest{
					HackathonId: hackathonID,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetQuestions()).To(HaveLen(3))

				// Should be ordered by order field ascending
				Expect(resp.GetQuestions()[0].GetOrder()).To(Equal(int32(1)))
				Expect(resp.GetQuestions()[0].GetKey()).To(Equal("agree_terms"))
				Expect(resp.GetQuestions()[1].GetOrder()).To(Equal(int32(5)))
				Expect(resp.GetQuestions()[1].GetKey()).To(Equal("dietary"))
				Expect(resp.GetQuestions()[2].GetOrder()).To(Equal(int32(10)))
				Expect(resp.GetQuestions()[2].GetKey()).To(Equal("company"))
			})

			It("returns correct question fields", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.ListQuestions(ctx, &msgs.ListQuestionsRequest{
					HackathonId: hackathonID,
				})
				Expect(err).NotTo(HaveOccurred())

				// Find the agree_terms question
				for _, q := range resp.GetQuestions() {
					if q.GetKey() == "agree_terms" {
						Expect(q.GetLabel()).To(Equal("I agree to terms"))
						Expect(q.GetType()).To(Equal(entities.QuestionType_QUESTION_TYPE_BOOL))
						Expect(q.GetMandatory()).To(BeFalse())
						Expect(q.GetId()).NotTo(BeEmpty())
						return
					}
				}
				Fail("agree_terms question not found")
			})

			It("returns empty list for hackathon with no questions", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// Create a new hackathon with no questions
				createResp, err := client.Create(ctx, &msgs.CreateRequest{
					Name:       "Empty Hackathon",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				})
				Expect(err).NotTo(HaveOccurred())

				resp, err := client.ListQuestions(ctx, &msgs.ListQuestionsRequest{
					HackathonId: createResp.GetHackathonId(),
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetQuestions()).To(BeEmpty())
			})

			It("requires Read permission on a private hackathon", func() {
				// Narrowed from "requires Read" outright: a public hackathon's
				// questions must be answerable before Join, and a non-member holds
				// no read grant — so requiring one deadlocked signup. A private
				// event still refuses an uninvited caller.
				adminCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs(
						"authorization",
						"Bearer "+testutils.CreateTestJWTToken(testAdmin),
					),
				)
				priv, err := client.Create(adminCtx, &msgs.CreateRequest{
					Name:       "QA Private Questions Hackathon",
					Visibility: entities.Visibility_VISIBILITY_PRIVATE,
				})
				Expect(err).NotTo(HaveOccurred())

				nonOwnerKeycloakID := "non-owner-list-q"
				_, err = dbClient.User.Create().
					SetKeycloakID(nonOwnerKeycloakID).
					SetUsername("non-owner-list-q-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err = client.ListQuestions(ctx, &msgs.ListQuestionsRequest{
					HackathonId: priv.GetHackathonId(),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})
		})

		// --- EditQuestion ---

		Describe("EditQuestion", func() {
			var questionID string

			BeforeEach(func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				createResp, err := client.CreateQuestion(ctx, &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "company",
					Label:       "Original label",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Mandatory:   false,
					Order:       1,
				})
				Expect(err).NotTo(HaveOccurred())
				questionID = createResp.GetQuestionId()
			})

			It("updates label", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				newLabel := "Updated label"
				_, err := client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  questionID,
					Label:       &newLabel,
				})
				Expect(err).NotTo(HaveOccurred())

				q, err := dbClient.Question.Query().
					Where(entquestion.IDEQ(uuid.MustParse(questionID))).
					Only(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(q.Label).To(Equal("Updated label"))
			})

			It("updates mandatory flag", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				m := true
				_, err := client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  questionID,
					Mandatory:   &m,
				})
				Expect(err).NotTo(HaveOccurred())

				q, err := dbClient.Question.Query().
					Where(entquestion.IDEQ(uuid.MustParse(questionID))).
					Only(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(q.Mandatory).To(BeTrue())
			})

			It("updates order", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				order := int32(99)
				_, err := client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  questionID,
					Order:       &order,
				})
				Expect(err).NotTo(HaveOccurred())

				q, err := dbClient.Question.Query().
					Where(entquestion.IDEQ(uuid.MustParse(questionID))).
					Only(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(q.Order).To(Equal(99))
			})

			It("allows partial updates (only provided fields)", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				newLabel := "New label only"
				_, err := client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  questionID,
					Label:       &newLabel,
				})
				Expect(err).NotTo(HaveOccurred())

				q, err := dbClient.Question.Query().
					Where(entquestion.IDEQ(uuid.MustParse(questionID))).
					Only(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(q.Label).To(Equal("New label only"))
				Expect(q.Mandatory).To(BeFalse()) // unchanged
				Expect(q.Order).To(Equal(1))      // unchanged
				Expect(q.PublicAnswers).To(BeFalse())
			})

			It("returns NOT_FOUND for invalid question ID", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  uuid.NewString(),
					Label:       testutils.StringPtr("Should fail"),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("returns NOT_FOUND for question in wrong hackathon", func() {
				// Create another hackathon and question
				adminCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs(
						"authorization",
						"Bearer "+testutils.CreateTestJWTToken(testAdmin),
					),
				)
				hack2Resp, err := client.Create(adminCtx, &msgs.CreateRequest{
					Name:       "Other Hackathon",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				})
				Expect(err).NotTo(HaveOccurred())

				qResp, err := client.CreateQuestion(adminCtx, &msgs.CreateQuestionRequest{
					HackathonId: hack2Resp.GetHackathonId(),
					Key:         "other_q",
					Label:       "Other",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Order:       1,
				})
				Expect(err).NotTo(HaveOccurred())

				// Try to edit from wrong hackathon context
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err = client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  qResp.GetQuestionId(),
					Label:       testutils.StringPtr("Should fail"),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("returns FAILED_PRECONDITION when changing type with existing answers", func() {
				// Create an answer for this question first
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// Create a participant to link the answer
				user, err := dbClient.User.Create().
					SetKeycloakID("answer-test-user").
					SetUsername("answer-test-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				participant, err := dbClient.Participant.Create().
					SetHackathonID(uuid.MustParse(hackathonID)).
					SetUserID(user.ID).
					SetIsWaiting(false).
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				// Create an answer
				_, err = dbClient.Answer.Create().
					SetQuestionID(uuid.MustParse(questionID)).
					SetUserID(participant.UserID).
					SetValue("test answer").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				// Try to change type - should fail
				_, err = client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  questionID,
					Type:        testutils.EnumPtr(entities.QuestionType_QUESTION_TYPE_BOOL),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.FailedPrecondition))
			})

			It(
				"returns FAILED_PRECONDITION when setting mandatory=true with existing answers",
				func() {
					// Create an answer for this question first
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					user, err := dbClient.User.Create().
						SetKeycloakID("mandatory-test-user").
						SetUsername("mandatory-test-username").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					participant, err := dbClient.Participant.Create().
						SetHackathonID(uuid.MustParse(hackathonID)).
						SetUserID(user.ID).
						SetIsWaiting(false).
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					_, err = dbClient.Answer.Create().
						SetQuestionID(uuid.MustParse(questionID)).
						SetUserID(participant.UserID).
						SetValue("test").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					m := true
					_, err = client.EditQuestion(ctx, &msgs.EditQuestionRequest{
						HackathonId: hackathonID,
						QuestionId:  questionID,
						Mandatory:   &m,
					})
					Expect(err).To(HaveOccurred())
					st := status.Convert(err)
					Expect(st.Code()).To(Equal(codes.FailedPrecondition))
				},
			)

			It("updates public_answers flag", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				p := true
				_, err := client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId:   hackathonID,
					QuestionId:    questionID,
					PublicAnswers: &p,
				})
				Expect(err).NotTo(HaveOccurred())

				q, err := dbClient.Question.Query().
					Where(entquestion.IDEQ(uuid.MustParse(questionID))).
					Only(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(q.PublicAnswers).To(BeTrue())
			})

			It("allows setting public_answers even when answers exist", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				user, err := dbClient.User.Create().
					SetKeycloakID("pa-edit-user").
					SetUsername("pa-edit-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				participant, err := dbClient.Participant.Create().
					SetHackathonID(uuid.MustParse(hackathonID)).
					SetUserID(user.ID).
					SetIsWaiting(false).
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				_, err = dbClient.Answer.Create().
					SetQuestionID(uuid.MustParse(questionID)).
					SetUserID(participant.UserID).
					SetValue("test").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				p := true
				_, err = client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId:   hackathonID,
					QuestionId:    questionID,
					PublicAnswers: &p,
				})
				Expect(err).NotTo(HaveOccurred())
			})

			It("allows setting mandatory=false when answers exist", func() {
				// Create an answer for this question first
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				user, err := dbClient.User.Create().
					SetKeycloakID("mandatory-false-user").
					SetUsername("mandatory-false-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				participant, err := dbClient.Participant.Create().
					SetHackathonID(uuid.MustParse(hackathonID)).
					SetUserID(user.ID).
					SetIsWaiting(false).
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				_, err = dbClient.Answer.Create().
					SetQuestionID(uuid.MustParse(questionID)).
					SetUserID(participant.UserID).
					SetValue("test").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				// Setting mandatory=false should be allowed even with answers
				m := false
				_, err = client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  questionID,
					Mandatory:   &m,
				})
				Expect(err).NotTo(HaveOccurred())
			})

			It("requires Write permission", func() {
				nonOwnerKeycloakID := "non-owner-edit-q"
				_, err := dbClient.User.Create().
					SetKeycloakID(nonOwnerKeycloakID).
					SetUsername("non-owner-edit-q-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err = client.EditQuestion(ctx, &msgs.EditQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  questionID,
					Label:       testutils.StringPtr("Unauthorized"),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})
		})

		// --- RemoveQuestion ---

		Describe("RemoveQuestion", func() {
			var questionID string

			BeforeEach(func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				createResp, err := client.CreateQuestion(ctx, &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "to_remove",
					Label:       "Will be removed",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Order:       1,
				})
				Expect(err).NotTo(HaveOccurred())
				questionID = createResp.GetQuestionId()
			})

			It("removes question successfully", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.RemoveQuestion(ctx, &msgs.RemoveQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  questionID,
				})
				Expect(err).NotTo(HaveOccurred())

				// Verify question is gone
				_, err = dbClient.Question.Query().
					Where(entquestion.IDEQ(uuid.MustParse(questionID))).
					Only(ctx)
				Expect(err).To(HaveOccurred())
				Expect(ent.IsNotFound(err)).To(BeTrue())
			})

			It("cascades to delete answers", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// Create an answer for this question
				user, err := dbClient.User.Create().
					SetKeycloakID("cascade-test-user").
					SetUsername("cascade-test-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				participant, err := dbClient.Participant.Create().
					SetHackathonID(uuid.MustParse(hackathonID)).
					SetUserID(user.ID).
					SetIsWaiting(false).
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				_, err = dbClient.Answer.Create().
					SetQuestionID(uuid.MustParse(questionID)).
					SetUserID(participant.UserID).
					SetValue("test answer").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				// Verify answer exists
				answerCount, err := dbClient.Answer.Query().
					Where(entanswer.QuestionIDEQ(uuid.MustParse(questionID))).
					Count(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(answerCount).To(Equal(1))

				// Remove question
				_, err = client.RemoveQuestion(ctx, &msgs.RemoveQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  questionID,
				})
				Expect(err).NotTo(HaveOccurred())

				// Verify answer was cascade-deleted
				answerCount, err = dbClient.Answer.Query().
					Where(entanswer.QuestionIDEQ(uuid.MustParse(questionID))).
					Count(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(answerCount).To(Equal(0))
			})

			It("returns NOT_FOUND for invalid question ID", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.RemoveQuestion(ctx, &msgs.RemoveQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  uuid.NewString(),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("returns NOT_FOUND for question in wrong hackathon", func() {
				// Create another hackathon and question
				adminCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs(
						"authorization",
						"Bearer "+testutils.CreateTestJWTToken(testAdmin),
					),
				)
				hack2Resp, err := client.Create(adminCtx, &msgs.CreateRequest{
					Name:       "Other Hackathon 2",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				})
				Expect(err).NotTo(HaveOccurred())

				qResp, err := client.CreateQuestion(adminCtx, &msgs.CreateQuestionRequest{
					HackathonId: hack2Resp.GetHackathonId(),
					Key:         "other_q2",
					Label:       "Other",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Order:       1,
				})
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err = client.RemoveQuestion(ctx, &msgs.RemoveQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  qResp.GetQuestionId(),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("requires Write permission", func() {
				nonOwnerKeycloakID := "non-owner-remove-q"
				_, err := dbClient.User.Create().
					SetKeycloakID(nonOwnerKeycloakID).
					SetUsername("non-owner-remove-q-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err = client.RemoveQuestion(ctx, &msgs.RemoveQuestionRequest{
					HackathonId: hackathonID,
					QuestionId:  questionID,
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})
		})

		// --- SubmitAnswers ---

		Describe("SubmitAnswers", func() {
			var questionID, questionID2 string

			BeforeEach(func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// Create two questions
				q1, err := client.CreateQuestion(ctx, &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "company",
					Label:       "Company",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Mandatory:   true,
					Order:       1,
				})
				Expect(err).NotTo(HaveOccurred())
				questionID = q1.GetQuestionId()

				q2, err := client.CreateQuestion(ctx, &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "role",
					Label:       "Role",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Mandatory:   false,
					Order:       2,
				})
				Expect(err).NotTo(HaveOccurred())
				questionID2 = q2.GetQuestionId()

				// Create a participant and make them an owner so they have Read permission
				user, err := dbClient.User.Create().
					SetKeycloakID("submit-answers-user").
					SetUsername("submit-answers-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				// Grant owner role so they have Read permission
				_, err = client.AddOwner(ctx, &msgs.AddOwnerRequest{
					HackathonId: hackathonID,
					UserId:      user.ID.String(),
				})
				Expect(err).NotTo(HaveOccurred())

				// Also create a participant record for the admin user so admin token works
				adminUser, err := dbClient.User.Query().
					Where(entuser.KeycloakIDEQ(testAdmin)).
					Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				_, err = dbClient.Participant.Create().
					SetHackathonID(uuid.MustParse(hackathonID)).
					SetUserID(adminUser.ID).
					SetIsWaiting(false).
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())
			})

			It("submits answers successfully", func() {
				// Use admin token since admin has global Read permission
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				answers := []*entities.Answer{
					{
						QuestionId: questionID,
						Value:      &entities.Answer_TextValue{TextValue: "Acme Corp"},
					},
					{
						QuestionId: questionID2,
						Value:      &entities.Answer_TextValue{TextValue: "Developer"},
					},
				}

				_, err := client.SubmitAnswers(ctx, &msgs.SubmitAnswersRequest{
					HackathonId: hackathonID,
					Answers:     answers,
				})
				Expect(err).NotTo(HaveOccurred())

				// Verify answers in DB - admin user's ID
				adminUser, err := dbClient.User.Query().
					Where(entuser.KeycloakIDEQ(testAdmin)).
					Only(context.Background())
				Expect(err).NotTo(HaveOccurred())

				answersFromDB, err := dbClient.Answer.Query().
					Where(
						entanswer.QuestionIDEQ(uuid.MustParse(questionID)),
						entanswer.UserID(adminUser.ID),
					).All(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(answersFromDB).To(HaveLen(1))
				Expect(answersFromDB[0].Value).To(Equal("Acme Corp"))

				answers2, err := dbClient.Answer.Query().
					Where(
						entanswer.QuestionIDEQ(uuid.MustParse(questionID2)),
						entanswer.UserID(adminUser.ID),
					).All(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(answers2).To(HaveLen(1))
				Expect(answers2[0].Value).To(Equal("Developer"))
			})

			It("rejects missing mandatory answers", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// Only answer the non-mandatory question
				_, err := client.SubmitAnswers(ctx, &msgs.SubmitAnswersRequest{
					HackathonId: hackathonID,
					Answers: []*entities.Answer{
						{
							QuestionId: questionID2,
							Value:      &entities.Answer_TextValue{TextValue: "Developer"},
						},
					},
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.FailedPrecondition))
				Expect(err.Error()).To(ContainSubstring("missing mandatory answers"))
			})

			It("upserts answers on re-submit", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// First submission
				_, err := client.SubmitAnswers(ctx, &msgs.SubmitAnswersRequest{
					HackathonId: hackathonID,
					Answers: []*entities.Answer{
						{
							QuestionId: questionID,
							Value:      &entities.Answer_TextValue{TextValue: "Old Corp"},
						},
					},
				})
				Expect(err).NotTo(HaveOccurred())

				// Second submission with updated value
				_, err = client.SubmitAnswers(ctx, &msgs.SubmitAnswersRequest{
					HackathonId: hackathonID,
					Answers: []*entities.Answer{
						{
							QuestionId: questionID,
							Value:      &entities.Answer_TextValue{TextValue: "New Corp"},
						},
					},
				})
				Expect(err).NotTo(HaveOccurred())

				// Verify only one answer exists with updated value
				adminUser, err := dbClient.User.Query().
					Where(entuser.KeycloakIDEQ(testAdmin)).
					Only(context.Background())
				Expect(err).NotTo(HaveOccurred())

				answersFromDB, err := dbClient.Answer.Query().
					Where(
						entanswer.QuestionIDEQ(uuid.MustParse(questionID)),
						entanswer.UserID(adminUser.ID),
					).All(ctx)
				Expect(err).NotTo(HaveOccurred())
				Expect(answersFromDB).To(HaveLen(1))
				Expect(answersFromDB[0].Value).To(Equal("New Corp"))
			})

			It("returns NOT_FOUND for invalid hackathon ID", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.SubmitAnswers(ctx, &msgs.SubmitAnswersRequest{
					HackathonId: uuid.NewString(),
					Answers: []*entities.Answer{
						{
							QuestionId: questionID,
							Value:      &entities.Answer_TextValue{TextValue: "Acme"},
						},
					},
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("denies anonymous users", func() {
				_, err := client.SubmitAnswers(context.Background(), &msgs.SubmitAnswersRequest{
					HackathonId: hackathonID,
					Answers: []*entities.Answer{
						{
							QuestionId: questionID,
							Value:      &entities.Answer_TextValue{TextValue: "Acme"},
						},
					},
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.Unauthenticated))
			})

			It("requires Read permission", func() {
				// Create a user with no access to the hackathon
				nonOwnerKeycloakID := "non-owner-submit"
				_, err := dbClient.User.Create().
					SetKeycloakID(nonOwnerKeycloakID).
					SetUsername("non-owner-submit-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err = client.SubmitAnswers(ctx, &msgs.SubmitAnswersRequest{
					HackathonId: hackathonID,
					Answers: []*entities.Answer{
						{
							QuestionId: questionID,
							Value:      &entities.Answer_TextValue{TextValue: "Acme"},
						},
					},
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})
		})

		// --- ListParticipantAnswers ---

		Describe("ListParticipantAnswers", func() {
			var questionID string
			var participantUser *ent.User
			var participantID string

			BeforeEach(func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// Create a question
				qResp, err := client.CreateQuestion(ctx, &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "company",
					Label:       "Company",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Order:       1,
				})
				Expect(err).NotTo(HaveOccurred())
				questionID = qResp.GetQuestionId()

				// Create a participant user
				participantUser, err = dbClient.User.Create().
					SetKeycloakID("list-answers-user").
					SetUsername("list-answers-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				participant, err := dbClient.Participant.Create().
					SetHackathonID(uuid.MustParse(hackathonID)).
					SetUserID(participantUser.ID).
					SetIsWaiting(false).
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())
				participantID = participant.UserID.String()

				// Create an answer
				_, err = dbClient.Answer.Create().
					SetQuestionID(uuid.MustParse(questionID)).
					SetUserID(participantUser.ID).
					SetValue("Acme Corp").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())
			})

			// Regression: `hasWrite` was computed but only consulted on the
			// "no user_id" path, so naming any user id skipped the check entirely
			// and returned what that person wrote about themselves.
			It("refuses a non-organizer naming someone else", func() {
				_, err := dbClient.User.Create().
					SetKeycloakID("lpa-outsider").
					SetUsername("lpa-outsider").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				outsiderCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs(
						"authorization",
						"Bearer "+testutils.CreateTestJWTToken("lpa-outsider"),
					),
				)
				_, err = client.ListParticipantAnswers(
					outsiderCtx,
					&msgs.ListParticipantAnswersRequest{
						HackathonId: hackathonID,
						UserId:      testutils.StringPtr(participantUser.ID.String()),
					})
				Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			})

			// Regression: the mapper always emitted text_value, so a BOOL answer
			// read back as text — and SubmitAnswers refuses a text answer to a
			// bool question. Loading a form and saving it unchanged therefore
			// failed on every bool question, which is what an edit does on save.
			It("reads a bool answer back as a bool, so a round trip re-submits", func() {
				adminCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs(
						"authorization",
						"Bearer "+testutils.CreateTestJWTToken(testAdmin),
					),
				)
				boolQ, err := client.CreateQuestion(adminCtx, &msgs.CreateQuestionRequest{
					HackathonId: hackathonID,
					Key:         "conduct",
					Label:       "I accept the Code of Conduct",
					Type:        entities.QuestionType_QUESTION_TYPE_BOOL,
					Order:       2,
				})
				Expect(err).NotTo(HaveOccurred())

				_, err = dbClient.Answer.Create().
					SetQuestionID(uuid.MustParse(boolQ.GetQuestionId())).
					SetUserID(participantUser.ID).
					SetValue("true").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				// The fixture writes the Participant row directly, so unlike a real
				// Join it grants no casbin Member role — and SubmitAnswers checks
				// hackathon:read.
				_, err = enf.AddRole("list-answers-user", middleware.Member, hackathonID)
				Expect(err).NotTo(HaveOccurred())

				participantCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs(
						"authorization",
						"Bearer "+testutils.CreateTestJWTToken("list-answers-user"),
					),
				)
				resp, err := client.ListParticipantAnswers(
					participantCtx,
					&msgs.ListParticipantAnswersRequest{HackathonId: hackathonID})
				Expect(err).NotTo(HaveOccurred())

				var readBack *entities.Answer
				for _, a := range resp.GetAnswers() {
					if a.GetQuestionId() == boolQ.GetQuestionId() {
						readBack = a
					}
				}
				Expect(readBack).NotTo(BeNil())
				Expect(readBack.GetBoolValue()).To(BeTrue())

				// Hand straight back what was read: this is the save an edit form
				// performs, and it used to fail with InvalidArgument.
				_, err = client.SubmitAnswers(participantCtx, &msgs.SubmitAnswersRequest{
					HackathonId: hackathonID,
					Answers:     resp.GetAnswers(),
				})
				Expect(err).NotTo(HaveOccurred())
			})
			It("returns answers for requester's own answers (no write access)", func() {
				token := testutils.CreateTestJWTToken("list-answers-user")
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.ListParticipantAnswers(ctx, &msgs.ListParticipantAnswersRequest{
					HackathonId: hackathonID,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetAnswers()).To(HaveLen(1))
				Expect(resp.GetAnswers()[0].GetQuestionId()).To(Equal(questionID))
				Expect(resp.GetAnswers()[0].GetTextValue()).To(Equal("Acme Corp"))
			})

			It(
				"returns answers to public questions from other participants (no write access)",
				func() {
					// Create a second participant with an answer to a public question
					otherUser, err := dbClient.User.Create().
						SetKeycloakID("lpa-other-user").
						SetUsername("lpa-other-username").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					_, err = dbClient.Participant.Create().
						SetHackathonID(uuid.MustParse(hackathonID)).
						SetUserID(otherUser.ID).
						SetIsWaiting(false).
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					// The existing question has public_answers=false, so this answer
					// should NOT be visible to the requester.
					_, err = dbClient.Answer.Create().
						SetQuestionID(uuid.MustParse(questionID)).
						SetUserID(otherUser.ID).
						SetValue("Other Corp").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					// Create a public question and an answer to it
					adminCtx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs(
							"authorization",
							"Bearer "+testutils.CreateTestJWTToken(testAdmin),
						),
					)
					publicQ, err := client.CreateQuestion(adminCtx, &msgs.CreateQuestionRequest{
						HackathonId:   hackathonID,
						Key:           "public_q",
						Label:         "Public question",
						Type:          entities.QuestionType_QUESTION_TYPE_TEXT,
						Order:         2,
						PublicAnswers: true,
					})
					Expect(err).NotTo(HaveOccurred())

					_, err = dbClient.Answer.Create().
						SetQuestionID(uuid.MustParse(publicQ.GetQuestionId())).
						SetUserID(otherUser.ID).
						SetValue("Public answer").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					// Requester sees: own answer + public answer from other user
					// but NOT the non-public answer from other user
					token := testutils.CreateTestJWTToken("list-answers-user")
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					resp, err := client.ListParticipantAnswers(
						ctx,
						&msgs.ListParticipantAnswersRequest{
							HackathonId: hackathonID,
						},
					)
					Expect(err).NotTo(HaveOccurred())
					Expect(resp.GetAnswers()).To(HaveLen(2))
					// Collect question IDs to verify which answers are returned
					questionIDs := map[string]bool{}
					for _, a := range resp.GetAnswers() {
						questionIDs[a.GetQuestionId()] = true
					}
					Expect(questionIDs).To(HaveKey(questionID))
					Expect(questionIDs).To(HaveKey(publicQ.GetQuestionId()))
				},
			)

			It("returns answers for specified user (write access)", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.ListParticipantAnswers(ctx, &msgs.ListParticipantAnswersRequest{
					HackathonId: hackathonID,
					UserId:      testutils.StringPtr(participantUser.ID.String()),
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetAnswers()).To(HaveLen(1))
				Expect(resp.GetAnswers()[0].GetQuestionId()).To(Equal(questionID))
			})

			It("returns empty list when no answers exist", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// Create another participant with no answers
				otherUser, err := dbClient.User.Create().
					SetKeycloakID("no-answers-user").
					SetUsername("no-answers-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				_, err = dbClient.Participant.Create().
					SetHackathonID(uuid.MustParse(hackathonID)).
					SetUserID(otherUser.ID).
					SetIsWaiting(false).
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				resp, err := client.ListParticipantAnswers(ctx, &msgs.ListParticipantAnswersRequest{
					HackathonId: hackathonID,
					UserId:      testutils.StringPtr(otherUser.ID.String()),
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetAnswers()).To(BeEmpty())
			})

			It("returns error for invalid user ID format", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.ListParticipantAnswers(ctx, &msgs.ListParticipantAnswersRequest{
					HackathonId: hackathonID,
					UserId:      testutils.StringPtr("not-a-uuid"),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.InvalidArgument))
			})

			It("denies anonymous users", func() {
				// Anonymous requests get sub="anonymous" from auth interceptor.
				// The handler then looks up user by keycloak ID "anonymous" which doesn't exist.
				_, err := client.ListParticipantAnswers(
					context.Background(),
					&msgs.ListParticipantAnswersRequest{
						HackathonId: hackathonID,
					},
				)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("returns answers with correct participant_id", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.ListParticipantAnswers(ctx, &msgs.ListParticipantAnswersRequest{
					HackathonId: hackathonID,
					UserId:      testutils.StringPtr(participantUser.ID.String()),
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetAnswers()).To(HaveLen(1))
				// ParticipantId in the answer is the participant's user ID
				Expect(resp.GetAnswers()[0].GetParticipantId()).To(Equal(participantID))
			})
		})
	})
	Describe("Invite Tests", func() {
		var (
			privateHackathonID string
			publicHackathonID  string
		)

		BeforeEach(func() {
			// Create a private hackathon
			adminToken := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+adminToken),
			)

			now := time.Now()
			privateResp, err := client.Create(adminCtx, &msgs.CreateRequest{
				Name:       "Private Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PRIVATE,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			privateHackathonID = privateResp.GetHackathonId()

			// Create a public hackathon
			publicResp, err := client.Create(adminCtx, &msgs.CreateRequest{
				Name:       "Public Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			publicHackathonID = publicResp.GetHackathonId()
		})

		Describe("CreateInvite", func() {
			It("creates an invite successfully", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				note := "Sent to mailing list"
				resp, err := client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
					Note:        &note,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetInvite()).NotTo(BeNil())
				Expect(resp.GetInvite().GetId()).NotTo(BeEmpty())
				Expect(resp.GetInvite().GetToken()).NotTo(BeEmpty())
				Expect(resp.GetInvite().GetNote()).To(Equal(note))
				Expect(resp.GetInvite().GetCreatedAt()).NotTo(BeNil())
				Expect(resp.GetInvite().GetRevokedAt()).To(BeNil())

				// Verify in database
				invite, err := dbClient.HackathonInvite.Query().
					Where(enthackathoninvite.IDEQ(uuid.MustParse(resp.GetInvite().GetId()))).
					WithHackathon().
					Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				Expect(invite.Token.String()).To(Equal(resp.GetInvite().GetToken()))
				Expect(invite.Note).To(Equal(note))
				Expect(invite.Edges.Hackathon.ID.String()).To(Equal(privateHackathonID))
			})

			It("defaults expires_at to hackathon.ends_at", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetInvite().GetExpiresAt()).NotTo(BeNil())

				// Verify in database
				invite, err := dbClient.HackathonInvite.Query().
					Where(enthackathoninvite.IDEQ(uuid.MustParse(resp.GetInvite().GetId()))).
					WithHackathon().
					Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				Expect(invite.ExpiresAt).NotTo(BeNil())
			})

			It("uses explicit expires_at when provided", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				expiry := time.Now().Add(7 * 24 * time.Hour)
				resp, err := client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
					ExpiresAt:   timestamppb.New(expiry),
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetInvite().GetExpiresAt()).NotTo(BeNil())
			})

			It("returns NOT_FOUND for non-existent hackathon", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: uuid.NewString(),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("requires Write permission", func() {
				nonOwnerKeycloakID := "invite-non-owner"
				_, err := dbClient.User.Create().
					SetKeycloakID(nonOwnerKeycloakID).
					SetUsername("invite-non-owner-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err = client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})
		})

		Describe("ListInvites", func() {
			It("returns all invites for a hackathon", func() {
				// Create two invites
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).NotTo(HaveOccurred())

				_, err = client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).NotTo(HaveOccurred())

				// List invites
				resp, err := client.ListInvites(ctx, &msgs.ListInvitesRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetInvites()).To(HaveLen(2))
			})

			It("returns invites with revoked_at set", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// Create and revoke an invite
				createResp, err := client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).NotTo(HaveOccurred())

				_, err = client.RevokeInvite(ctx, &msgs.RevokeInviteRequest{
					InviteId: createResp.GetInvite().GetId(),
				})
				Expect(err).NotTo(HaveOccurred())

				// List should still return it
				resp, err := client.ListInvites(ctx, &msgs.ListInvitesRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetInvites()).To(HaveLen(1))
				Expect(resp.GetInvites()[0].GetRevokedAt()).NotTo(BeNil())
			})

			It("returns empty list when no invites exist", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.ListInvites(ctx, &msgs.ListInvitesRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetInvites()).To(BeEmpty())
			})

			It("returns NOT_FOUND for non-existent hackathon", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.ListInvites(ctx, &msgs.ListInvitesRequest{
					HackathonId: uuid.NewString(),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("requires Write permission", func() {
				nonOwnerKeycloakID := "list-invites-non-owner"
				_, err := dbClient.User.Create().
					SetKeycloakID(nonOwnerKeycloakID).
					SetUsername("list-invites-non-owner-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err = client.ListInvites(ctx, &msgs.ListInvitesRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})
		})

		Describe("RevokeInvite", func() {
			var inviteID string

			BeforeEach(func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).NotTo(HaveOccurred())
				inviteID = resp.GetInvite().GetId()
			})

			It("revokes an invite successfully", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.RevokeInvite(ctx, &msgs.RevokeInviteRequest{
					InviteId: inviteID,
				})
				Expect(err).NotTo(HaveOccurred())

				// Verify in database
				invite, err := dbClient.HackathonInvite.Query().
					Where(enthackathoninvite.IDEQ(uuid.MustParse(inviteID))).
					Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				Expect(invite.RevokedAt).NotTo(BeNil())
			})

			It("is idempotent - revoking twice succeeds", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// First revoke
				_, err := client.RevokeInvite(ctx, &msgs.RevokeInviteRequest{
					InviteId: inviteID,
				})
				Expect(err).NotTo(HaveOccurred())

				// Second revoke should also succeed
				_, err = client.RevokeInvite(ctx, &msgs.RevokeInviteRequest{
					InviteId: inviteID,
				})
				Expect(err).NotTo(HaveOccurred())
			})

			It("returns NOT_FOUND for non-existent invite", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.RevokeInvite(ctx, &msgs.RevokeInviteRequest{
					InviteId: uuid.NewString(),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("requires Write permission on the hackathon", func() {
				nonOwnerKeycloakID := "revoke-non-owner"
				_, err := dbClient.User.Create().
					SetKeycloakID(nonOwnerKeycloakID).
					SetUsername("revoke-non-owner-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err = client.RevokeInvite(ctx, &msgs.RevokeInviteRequest{
					InviteId: inviteID,
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})
		})

		Describe("PreviewInvite", func() {
			var inviteToken string
			var inviteId string

			BeforeEach(func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).NotTo(HaveOccurred())
				inviteId = resp.GetInvite().GetId()
				inviteToken = resp.GetInvite().GetToken()
			})

			It("returns shallow hackathon for valid token", func() {
				resp, err := client.PreviewInvite(context.Background(), &msgs.PreviewInviteRequest{
					Token: inviteToken,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetHackathon()).NotTo(BeNil())
				Expect(resp.GetHackathon().GetId()).To(Equal(privateHackathonID))
				Expect(resp.GetHackathon().GetName()).To(Equal("Private Test Hackathon"))
				Expect(
					resp.GetHackathon().GetVisibility(),
				).To(Equal(entities.Visibility_VISIBILITY_PRIVATE))
				Expect(resp.GetAlreadyParticipant()).To(BeFalse())
			})

			It("returns questions in the response", func() {
				// Create a question for the hackathon
				adminToken := testutils.CreateTestJWTToken(testAdmin)
				adminCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+adminToken),
				)
				_, err := client.CreateQuestion(adminCtx, &msgs.CreateQuestionRequest{
					HackathonId: privateHackathonID,
					Key:         "name",
					Label:       "What is your name?",
					Type:        entities.QuestionType_QUESTION_TYPE_TEXT,
					Mandatory:   true,
				})
				Expect(err).NotTo(HaveOccurred())

				resp, err := client.PreviewInvite(context.Background(), &msgs.PreviewInviteRequest{
					Token: inviteToken,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetQuestions()).To(HaveLen(1))
				Expect(resp.GetQuestions()[0].GetKey()).To(Equal("name"))
			})

			It("returns already_participant=true for existing participant", func() {
				// Create a user and participant
				participantKeycloakID := "preview-participant"
				participantUser, err := dbClient.User.Create().
					SetKeycloakID(participantKeycloakID).
					SetUsername("preview-participant-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				_, err = dbClient.Participant.Create().
					SetHackathonID(uuid.MustParse(privateHackathonID)).
					SetUserID(participantUser.ID).
					SetIsWaiting(true).
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				// Preview as that user
				token := testutils.CreateTestJWTToken(participantKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				resp, err := client.PreviewInvite(ctx, &msgs.PreviewInviteRequest{
					Token: inviteToken,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetAlreadyParticipant()).To(BeTrue())
			})

			It("returns INVALID_ARGUMENT for invalid token format", func() {
				_, err := client.PreviewInvite(context.Background(), &msgs.PreviewInviteRequest{
					Token: "not-a-uuid",
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.InvalidArgument))
			})

			It("returns NOT_FOUND for non-existent token", func() {
				_, err := client.PreviewInvite(context.Background(), &msgs.PreviewInviteRequest{
					Token: uuid.NewString(),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("returns NOT_FOUND for revoked token", func() {
				// Revoke the invite
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := client.RevokeInvite(ctx, &msgs.RevokeInviteRequest{
					InviteId: inviteId,
				})
				Expect(err).NotTo(HaveOccurred())

				// Preview should fail
				_, err = client.PreviewInvite(context.Background(), &msgs.PreviewInviteRequest{
					Token: inviteToken,
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("returns NOT_FOUND for expired token", func() {
				// Create an invite with past expiry
				adminToken := testutils.CreateTestJWTToken(testAdmin)
				adminCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+adminToken),
				)
				pastExpiry := time.Now().Add(-24 * time.Hour)
				resp, err := client.CreateInvite(adminCtx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
					ExpiresAt:   timestamppb.New(pastExpiry),
				})
				Expect(err).NotTo(HaveOccurred())

				_, err = client.PreviewInvite(context.Background(), &msgs.PreviewInviteRequest{
					Token: resp.GetInvite().GetToken(),
				})
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("works without authentication", func() {
				// PreviewInvite should work without auth
				resp, err := client.PreviewInvite(context.Background(), &msgs.PreviewInviteRequest{
					Token: inviteToken,
				})
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetHackathon()).NotTo(BeNil())
			})
		})

		Describe("Join with invite", func() {
			var inviteToken string

			BeforeEach(func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)
				_, err := client.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
					HackathonId: publicHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
					},
				})

				_, err = client.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
					HackathonId: privateHackathonID,
					Capabilities: []*msgs.CapabilityState{
						{Capability: entities.Capability_CAPABILITY_REGISTER, Enabled: true},
					},
				})

				resp, err := client.CreateInvite(ctx, &msgs.CreateInviteRequest{
					HackathonId: privateHackathonID,
				})
				Expect(err).NotTo(HaveOccurred())
				inviteToken = resp.GetInvite().GetToken()
			})

			It("allows join with valid invite token on private hackathon", func() {
				nonAdminKeycloakID := "invite-join-user"
				token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// Ensure user exists
				user, err := dbClient.User.Create().
					SetKeycloakID(nonAdminKeycloakID).
					SetUsername("invite-join-user-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				joinReq := &msgs.JoinRequest{
					HackathonId: privateHackathonID,
					InviteToken: &inviteToken,
				}
				joinResp, err := client.Join(ctx, joinReq)
				Expect(err).NotTo(HaveOccurred())
				Expect(joinResp.GetHackathonId()).To(Equal(privateHackathonID))

				// Verify participant was created
				participant, err := dbClient.Participant.Query().
					Where(
						entparticipant.HackathonIDEQ(uuid.MustParse(privateHackathonID)),
						entparticipant.UserID(user.ID),
					).
					WithUser().
					Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				Expect(participant.IsWaiting).To(BeTrue())
			})

			It("rejects join without invite token on private hackathon", func() {
				nonAdminKeycloakID := "invite-no-token-user"
				token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := dbClient.User.Create().
					SetKeycloakID(nonAdminKeycloakID).
					SetUsername("invite-no-token-user-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				joinReq := &msgs.JoinRequest{
					HackathonId: privateHackathonID,
				}
				_, err = client.Join(ctx, joinReq)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.PermissionDenied))
			})

			It("rejects join with invalid invite token on private hackathon", func() {
				nonAdminKeycloakID := "invite-invalid-token-user"
				token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := dbClient.User.Create().
					SetKeycloakID(nonAdminKeycloakID).
					SetUsername("invite-invalid-token-user-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				joinReq := &msgs.JoinRequest{
					HackathonId: privateHackathonID,
					InviteToken: testutils.StringPtr(uuid.NewString()),
				}
				_, err = client.Join(ctx, joinReq)
				Expect(err).To(HaveOccurred())
				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.NotFound))
			})

			It("allows join on public hackathon without invite token", func() {
				nonAdminKeycloakID := "public-join-user"
				token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				_, err := dbClient.User.Create().
					SetKeycloakID(nonAdminKeycloakID).
					SetUsername("public-join-user-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				joinReq := &msgs.JoinRequest{
					HackathonId: publicHackathonID,
				}
				joinResp, err := client.Join(ctx, joinReq)
				Expect(err).NotTo(HaveOccurred())
				Expect(joinResp.GetHackathonId()).To(Equal(publicHackathonID))
			})
		})
	})
})
