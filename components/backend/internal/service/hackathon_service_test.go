package service_test

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	"github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
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
			ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

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
			gomega.Expect(err).NotTo(gomega.HaveOccurred())
			gomega.Expect(resp.HackathonId).NotTo(gomega.BeEmpty())

			// Verify in database
			h, err := dbClient.Hackathon.Query().
				Where(enthackathon.IDEQ(uuid.MustParse(resp.HackathonId))).
				WithCreator().
				Only(context.Background())
			gomega.Expect(err).NotTo(gomega.HaveOccurred())
			gomega.Expect(h.Name).To(gomega.Equal("Test Hackathon"))
			gomega.Expect(h.Visibility).To(gomega.Equal(enthackathon.VisibilityPublic))
			gomega.Expect(h.Edges.Creator).NotTo(gomega.BeNil())
			gomega.Expect(h.Edges.Creator.KeycloakID).To(gomega.Equal(testAdmin))
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
			ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

			for _, h := range hackathons {
				req := &msgs.CreateRequest{
					Name:       h.name,
					Visibility: h.visibility,
				}
				_, err := client.Create(ctx, req)
				gomega.Expect(err).NotTo(gomega.HaveOccurred())
			}
		})

		It("lists all hackathons for authorized user", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

			listResp, err := client.List(ctx, &msgs.ListRequest{})
			gomega.Expect(err).NotTo(gomega.HaveOccurred())
			gomega.Expect(listResp.Hackathons).To(gomega.HaveLen(len(hackathons)))

			// Verify each hackathon exists in list
			for _, expected := range hackathons {
				found := false
				for _, actual := range listResp.Hackathons {
					if actual.Name == expected.name && actual.Visibility == expected.visibility {
						found = true
						break
					}
				}
				gomega.Expect(found).To(gomega.BeTrue(), "should find %s in list", expected.name)
			}
		})

		It("returns correct fields for each hackathon", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

			listResp, err := client.List(ctx, &msgs.ListRequest{})
			gomega.Expect(err).NotTo(gomega.HaveOccurred())
			gomega.Expect(len(listResp.Hackathons)).To(gomega.BeNumerically(">", 0))

			// Check first hackathon has required fields
			h := listResp.Hackathons[0]
			gomega.Expect(h.Id).NotTo(gomega.BeEmpty())
			gomega.Expect(h.Name).NotTo(gomega.BeEmpty())
			gomega.Expect(h.Visibility).NotTo(gomega.Equal(entities.Visibility_VISIBILITY_UNSPECIFIED))
		})
	})

	Describe("Get", func() {
		var createdID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

			now := time.Now()
			createReq := &msgs.CreateRequest{
				Name:       "Get Test Hackathon",
				Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			}

			createResp, err := client.Create(ctx, createReq)
			gomega.Expect(err).NotTo(gomega.HaveOccurred())
			gomega.Expect(createResp.HackathonId).NotTo(gomega.BeEmpty())
			createdID = createResp.HackathonId
		})

		It("retrieves hackathon with full details", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

			getReq := &msgs.GetRequest{HackathonId: createdID}
			getResp, err := client.Get(ctx, getReq)
			gomega.Expect(err).NotTo(gomega.HaveOccurred())

			h := getResp.Hackathon
			gomega.Expect(h.Id).To(gomega.Equal(createdID))
			gomega.Expect(h.Name).To(gomega.Equal("Get Test Hackathon"))
			gomega.Expect(h.Visibility).To(gomega.Equal(entities.Visibility_VISIBILITY_PUBLIC))

			// Check creator is populated
			gomega.Expect(h.Creator).NotTo(gomega.BeNil())
			gomega.Expect(h.Creator.KeycloakId).To(gomega.Equal(testAdmin))
			gomega.Expect(h.Creator.Username).To(gomega.Equal("hackagon-admin"))
		})

		It("returns correct status", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

			getReq := &msgs.GetRequest{HackathonId: createdID}
			getResp, err := client.Get(ctx, getReq)
			gomega.Expect(err).NotTo(gomega.HaveOccurred())

			h := getResp.Hackathon
			// Status should be computed based on dates
			gomega.Expect(h.Status).NotTo(gomega.Equal(entities.HackathonStatus_HACKATHON_STATUS_UNSPECIFIED))
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

			getReq := &msgs.GetRequest{HackathonId: uuid.NewString()}
			_, err := client.Get(ctx, getReq)
			gomega.Expect(err).To(gomega.HaveOccurred())

			st := status.Convert(err)
			gomega.Expect(st.Code()).To(gomega.Equal(codes.NotFound))
		})
	})

	Describe("Authentication and RBAC", func() {
		Describe("Create permissions", func() {
			It("allows admin to create hackathons", func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

				req := &msgs.CreateRequest{
					Name:       "Auth Test Hackathon",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				}

				resp, err := client.Create(ctx, req)
				gomega.Expect(err).NotTo(gomega.HaveOccurred())
				gomega.Expect(resp.HackathonId).NotTo(gomega.BeEmpty())
			})

			It("denies non-admin users without roles from creating", func() {
				token := testutils.CreateTestJWTToken("non-admin-user")
				ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

				req := &msgs.CreateRequest{
					Name:       "Unauthorized Create",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				}

				resp, err := client.Create(ctx, req)
				gomega.Expect(err).To(gomega.HaveOccurred())
				gomega.Expect(resp).To(gomega.BeNil())

				st := status.Convert(err)
				gomega.Expect(st.Code()).To(gomega.Equal(codes.PermissionDenied))
			})

			It("denies anonymous requests from creating", func() {
				// No auth header
				ctx := context.Background()

				req := &msgs.CreateRequest{
					Name:       "Anonymous Create",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				}

				resp, err := client.Create(ctx, req)
				gomega.Expect(err).To(gomega.HaveOccurred())
				gomega.Expect(resp).To(gomega.BeNil())

				st := status.Convert(err)
				gomega.Expect(st.Code()).To(gomega.Equal(codes.PermissionDenied))
			})
		})

		Describe("List permissions", func() {
			It("allows authorized users to list public hackathons", func() {
				// List with authorized user - may be empty list if no hackathons exist
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

				resp, err := client.List(ctx, &msgs.ListRequest{})
				gomega.Expect(err).NotTo(gomega.HaveOccurred())
				// Should return empty list (not error) when no hackathons exist
				gomega.Expect(resp.Hackathons).To(gomega.BeEmpty())
			})

			It("allows anonymous users to list public hackathons but not private ones", func() {
				// No auth header - anonymous
				ctx := context.Background()

				// Create both public and private hackathons as admin
				adminToken := testutils.CreateTestJWTToken(testAdmin)
				adminCtx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+adminToken))

				// Create public hackathon
				_, err := client.Create(adminCtx, &msgs.CreateRequest{
					Name:       "Public Hackathon",
					Visibility: entities.Visibility_VISIBILITY_PUBLIC,
				})
				gomega.Expect(err).NotTo(gomega.HaveOccurred())

				// Create private hackathon
				_, err = client.Create(adminCtx, &msgs.CreateRequest{
					Name:       "Private Hackathon",
					Visibility: entities.Visibility_VISIBILITY_PRIVATE,
				})
				gomega.Expect(err).NotTo(gomega.HaveOccurred())

				// Now list as anonymous - should only see public hackathons
				resp, err := client.List(ctx, &msgs.ListRequest{})
				gomega.Expect(err).NotTo(gomega.HaveOccurred())
				gomega.Expect(resp.Hackathons).NotTo(gomega.BeNil())
				gomega.Expect(resp.Hackathons).To(gomega.HaveLen(1), "should only list public hackathons")
				gomega.Expect(resp.Hackathons[0].Name).To(gomega.Equal("Public Hackathon"))
				gomega.Expect(resp.Hackathons[0].Visibility).To(gomega.Equal(entities.Visibility_VISIBILITY_PUBLIC))
			})
		})
	})

})
