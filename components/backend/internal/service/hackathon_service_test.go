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
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("HackathonService", func() {

	var (
		dbClient  *ent.Client
		conn      *grpc.ClientConn
		client    hackathonSvc.HackathonServiceClient
		testAdmin string
	)

	BeforeEach(func() {
		dbClient, conn = testutils.CreateTestServer()
		testAdmin = testutils.TestAdminKeycloakID

		client = hackathonSvc.NewHackathonServiceClient(conn)
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

})
