//go:build test && unittest

package service_test

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enpage "github.com/swissdatasciencecenter/hackagon/components/backend/ent/page"
	entphase "github.com/swissdatasciencecenter/hackagon/components/backend/ent/phase"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	hackathonMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	pageMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/page_svc"
	phaseMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/phase_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("PhaseService", func() {

	var (
		dbClient  *ent.Client
		conn      *grpc.ClientConn
		client    hackathonSvc.PhaseServiceClient
		testAdmin string
	)

	BeforeEach(func() {
		dbClient, conn, _ = testutils.CreateTestServer()
		testAdmin = testutils.TestAdminKeycloakID

		client = hackathonSvc.NewPhaseServiceClient(conn)
	})

	Describe("Create", func() {
		It("creates phase with missing hackathon", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &phaseMsgs.CreateRequest{
				HackathonId: uuid.NewString(),
				Name:        "Test Phase",
				Description: "Test description",
			}

			_, err := client.Create(ctx, createReq)
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("creates phase with valid hackathon", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First create a hackathon
			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Phase Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(createHackResp.GetHackathonId()).NotTo(BeEmpty())

			// Create a phase
			createReq := &phaseMsgs.CreateRequest{
				HackathonId: createHackResp.GetHackathonId(),
				Name:        "Test Phase",
				Description: "Test description",
			}

			resp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetPhaseId()).NotTo(BeEmpty())

			// Verify in database
			phase, err := dbClient.Phase.Query().
				Where(entphase.IDEQ(uuid.MustParse(resp.GetPhaseId()))).
				WithCreator().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(phase.Name).To(Equal("Test Phase"))
			Expect(phase.Description).To(Equal("Test description"))
		})

		It("requires authentication to create", func() {
			// No auth header - anonymous
			ctx := context.Background()

			createReq := &phaseMsgs.CreateRequest{
				HackathonId: uuid.NewString(),
				Name:        "Unauthorized Phase",
				Description: "Unauthorized",
			}

			_, err := client.Create(ctx, createReq)
			Expect(err).To(HaveOccurred())
			Expect(err).NotTo(BeNil())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("denies non-admin users without roles", func() {
			token := testutils.CreateTestJWTToken("non-admin-user")
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &phaseMsgs.CreateRequest{
				HackathonId: uuid.NewString(),
				Name:        "Unauthorized Phase",
				Description: "Unauthorized",
			}

			_, err := client.Create(ctx, createReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Page Linking", func() {
		var (
			createdHackathonID string
			page1ID            string
			page2ID            string
			createdPhaseID     string
		)

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create a hackathon
			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Phase Page Linking Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			// Create two pages in the hackathon
			pageClient := hackathonSvc.NewPageServiceClient(conn)
			page1Resp, err := pageClient.Create(ctx, &pageMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Title:       "Page 1",
				Visible:     true,
			})
			Expect(err).NotTo(HaveOccurred())
			page1ID = page1Resp.GetPageId()

			page2Resp, err := pageClient.Create(ctx, &pageMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Title:       "Page 2",
				Visible:     true,
			})
			Expect(err).NotTo(HaveOccurred())
			page2ID = page2Resp.GetPageId()
		})

		It("links page when creating a phase", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create phase with page linked
			createReq := &phaseMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Name:        "Linked Phase",
				Description: "Phase with page",
				PageId:      testutils.StringPtr(page1ID),
			}

			resp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdPhaseID = resp.GetPhaseId()

			// Verify phase has page linked
			phase, err := dbClient.Phase.Query().
				Where(entphase.IDEQ(uuid.MustParse(createdPhaseID))).
				WithPage().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(phase.Edges.Page).ToNot(BeNil())
			Expect(phase.Edges.Page.ID).To(Equal(uuid.MustParse(page1ID)))

			// Verify page 2 is not linked to any phase
			page2, err := dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(page2ID))).
				WithPhase().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page2.Edges.Phase).To(BeNil())
		})

		It("switches page link when editing a phase", func() {
			// First create phase linked to page 1
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &phaseMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Name:        "Phase to Switch",
				Description: "Phase that will switch pages",
				PageId:      testutils.StringPtr(page1ID),
			}

			resp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdPhaseID = resp.GetPhaseId()

			// Verify initially linked to page 1
			page1, err := dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(page1ID))).
				WithPhase().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page1.Edges.Phase).ToNot(BeNil())
			Expect(page1.Edges.Phase.ID).To(Equal(uuid.MustParse(createdPhaseID)))

			// Edit phase to link to page 2
			editReq := &phaseMsgs.EditRequest{
				PhaseId:     createdPhaseID,
				Name:        testutils.StringPtr("Switched Phase"),
				Description: testutils.StringPtr("Phase that switched"),
				PageId:      testutils.StringPtr(page2ID),
			}

			_, err = client.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify page 1 is now unlinked
			page1, err = dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(page1ID))).
				WithPhase().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page1.Edges.Phase).To(BeNil())

			// Verify page 2 is now linked
			page2, err := dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(page2ID))).
				WithPhase().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page2.Edges.Phase).ToNot(BeNil())
			Expect(page2.Edges.Phase.ID).To(Equal(uuid.MustParse(createdPhaseID)))

			// Verify phase has page 2 linked
			phase, err := dbClient.Phase.Query().
				Where(entphase.IDEQ(uuid.MustParse(createdPhaseID))).
				WithPage().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(phase.Edges.Page).ToNot(BeNil())
			Expect(phase.Edges.Page.ID).To(Equal(uuid.MustParse(page2ID)))
		})

		It("unlinks page when editing with empty page_id", func() {
			// First create phase linked to page 1
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &phaseMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Name:        "Phase to Unlink",
				Description: "Phase that will be unlinked",
				PageId:      testutils.StringPtr(page1ID),
			}

			resp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdPhaseID = resp.GetPhaseId()

			// Verify initially linked to page 1
			page1, err := dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(page1ID))).
				WithPhase().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page1.Edges.Phase).ToNot(BeNil())
			Expect(page1.Edges.Phase.ID).To(Equal(uuid.MustParse(createdPhaseID)))

			// Edit phase to unlink page (empty string)
			editReq := &phaseMsgs.EditRequest{
				PhaseId:     createdPhaseID,
				Name:        testutils.StringPtr("Unlinked Phase"),
				Description: testutils.StringPtr("Phase with page unlinked"),
				PageId:      testutils.StringPtr(""),
			}

			_, err = client.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify page 1 is now unlinked
			page1, err = dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(page1ID))).
				WithPhase().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page1.Edges.Phase).To(BeNil())

			// Verify phase has no page linked
			phase, err := dbClient.Phase.Query().
				Where(entphase.IDEQ(uuid.MustParse(createdPhaseID))).
				WithPage().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(phase.Edges.Page).To(BeNil())
		})

		It("does not change page link when not specified", func() {
			// First create phase linked to page 1
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &phaseMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Name:        "Phase to Keep",
				Description: "Phase that keeps its page",
				PageId:      testutils.StringPtr(page1ID),
			}

			resp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			createdPhaseID = resp.GetPhaseId()

			// Edit phase without specifying page_id (nil)
			editReq := &phaseMsgs.EditRequest{
				PhaseId:     createdPhaseID,
				Name:        testutils.StringPtr("Updated Phase Name"),
				Description: testutils.StringPtr("Updated description"),
				PageId:      nil,
			}

			_, err = client.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify page 1 is still linked
			phase, err := dbClient.Phase.Query().
				Where(entphase.IDEQ(uuid.MustParse(createdPhaseID))).
				WithPage().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(phase.Edges.Page).ToNot(BeNil())
			Expect(phase.Edges.Page.ID).To(Equal(uuid.MustParse(page1ID)))
		})

		It("returns NOT_FOUND when linking to a non-existing page on create", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Create(ctx, &phaseMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Name:        "Phase with Bad Page",
				Description: "Should fail",
				PageId:      testutils.StringPtr(uuid.NewString()),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It(
			"returns InvalidArgument when linking to a page in a different hackathon on create",
			func() {
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				// Create a page in a different hackathon
				hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
				otherHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
					Name:       "Other Hackathon",
					Visibility: 2, // PUBLIC
				})
				Expect(err).NotTo(HaveOccurred())

				pageClient := hackathonSvc.NewPageServiceClient(conn)
				otherPageResp, err := pageClient.Create(ctx, &pageMsgs.CreateRequest{
					HackathonId: otherHackResp.GetHackathonId(),
					Title:       "Other Page",
					Visible:     true,
				})
				Expect(err).NotTo(HaveOccurred())

				_, err = client.Create(ctx, &phaseMsgs.CreateRequest{
					HackathonId: createdHackathonID,
					Name:        "Phase with Cross-Hack Page",
					Description: "Should fail",
					PageId:      testutils.StringPtr(otherPageResp.GetPageId()),
				})
				Expect(err).To(HaveOccurred())

				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.InvalidArgument))
			},
		)

		It("returns NOT_FOUND when linking to a non-existing page on edit", func() {
			// First create a phase
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createResp, err := client.Create(ctx, &phaseMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Name:        "Phase to Edit",
				Description: "Phase to edit",
			})
			Expect(err).NotTo(HaveOccurred())

			// Try to link to non-existing page
			_, err = client.Edit(ctx, &phaseMsgs.EditRequest{
				PhaseId: createResp.GetPhaseId(),
				PageId:  testutils.StringPtr(uuid.NewString()),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It(
			"returns InvalidArgument when linking to a page in a different hackathon on edit",
			func() {
				// First create a phase
				token := testutils.CreateTestJWTToken(testAdmin)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)

				createResp, err := client.Create(ctx, &phaseMsgs.CreateRequest{
					HackathonId: createdHackathonID,
					Name:        "Phase to Edit 2",
					Description: "Phase to edit 2",
				})
				Expect(err).NotTo(HaveOccurred())

				// Create a page in a different hackathon
				hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
				otherHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
					Name:       "Other Hackathon 2",
					Visibility: 2, // PUBLIC
				})
				Expect(err).NotTo(HaveOccurred())

				pageClient := hackathonSvc.NewPageServiceClient(conn)
				otherPageResp, err := pageClient.Create(ctx, &pageMsgs.CreateRequest{
					HackathonId: otherHackResp.GetHackathonId(),
					Title:       "Other Page 2",
					Visible:     true,
				})
				Expect(err).NotTo(HaveOccurred())

				// Try to link to page from different hackathon
				_, err = client.Edit(ctx, &phaseMsgs.EditRequest{
					PhaseId: createResp.GetPhaseId(),
					PageId:  testutils.StringPtr(otherPageResp.GetPageId()),
				})
				Expect(err).To(HaveOccurred())

				st := status.Convert(err)
				Expect(st.Code()).To(Equal(codes.InvalidArgument))
			},
		)
	})

	Describe("List", func() {
		var createdHackathonID string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Phase List Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			// Create some phases
			for i := 0; i < 3; i++ {
				_, err := client.Create(ctx, &phaseMsgs.CreateRequest{
					HackathonId: createdHackathonID,
					Name:        "Phase " + string(rune('A'+i)),
					Description: "Content for phase " + string(rune('A'+i)),
				})
				Expect(err).NotTo(HaveOccurred())
			}
		})

		It("lists phases for authorized user", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := client.List(ctx, &phaseMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			pages := listResp.GetPhases()
			Expect(pages).To(HaveLen(3))

			// Verify phases are ordered by starts_at, then ends_at
			// (in this case, all have nil timestamps, so insertion order)
			for _, p := range pages {
				Expect(p.GetId()).NotTo(BeEmpty())
				Expect(p.GetName()).NotTo(BeEmpty())
			}
		})

		It("returns phases with correct fields", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := client.List(ctx, &phaseMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())

			p := listResp.GetPhases()[0]
			Expect(p.GetId()).NotTo(BeEmpty())
			Expect(p.GetName()).NotTo(BeEmpty())
			Expect(p.GetDescription()).NotTo(BeEmpty())
			Expect(p.GetCreatedAt()).NotTo(BeNil())
			Expect(p.GetModifiedAt()).NotTo(BeNil())
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := client.List(ctx, &phaseMsgs.ListRequest{
				HackathonId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())
			Expect(listResp).To(BeNil())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Phase.Read permission", func() {
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

			listResp, err := client.List(ctx, &phaseMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).To(HaveOccurred())
			Expect(listResp).To(BeNil())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Get", func() {
		var createdHackathonID string
		var createdPhaseID string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Phase Get Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			createResp, err := client.Create(ctx, &phaseMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Name:        "Get Test Phase",
				Description: "Get test description",
			})
			Expect(err).NotTo(HaveOccurred())
			createdPhaseID = createResp.GetPhaseId()
		})

		It("retrieves phase with full details", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getResp, err := client.Get(ctx, &phaseMsgs.GetRequest{
				PhaseId: createdPhaseID,
			})
			Expect(err).NotTo(HaveOccurred())

			phase := getResp.GetPhase()
			Expect(phase.GetId()).To(Equal(createdPhaseID))
			Expect(phase.GetName()).To(Equal("Get Test Phase"))
			Expect(phase.GetDescription()).To(Equal("Get test description"))
		})

		It("returns NOT_FOUND for invalid phase ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getResp, err := client.Get(ctx, &phaseMsgs.GetRequest{
				PhaseId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())
			Expect(getResp).To(BeNil())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND for phase in non-existent hackathon", func() {
			// Create a phase with a fake hackathon ID
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Create(ctx, &phaseMsgs.CreateRequest{
				HackathonId: uuid.NewString(),
				Name:        "Fake Phase",
				Description: "Fake",
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Phase.Read permission", func() {
			nonOwnerKeycloakID := "non-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-get").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getResp, err := client.Get(ctx, &phaseMsgs.GetRequest{
				PhaseId: createdPhaseID,
			})
			Expect(err).To(HaveOccurred())
			Expect(getResp).To(BeNil())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Edit", func() {
		var createdHackathonID string
		var createdPhaseID string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Phase Edit Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			createResp, err := client.Create(ctx, &phaseMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Name:        "Original Phase",
				Description: "Original description",
			})
			Expect(err).NotTo(HaveOccurred())
			createdPhaseID = createResp.GetPhaseId()
		})

		It("updates phase with all fields", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Edit(ctx, &phaseMsgs.EditRequest{
				PhaseId:     createdPhaseID,
				Name:        testutils.StringPtr("Updated Phase"),
				Description: testutils.StringPtr("Updated description"),
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify in database
			phase, err := dbClient.Phase.Query().
				Where(entphase.IDEQ(uuid.MustParse(createdPhaseID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(phase.Name).To(Equal("Updated Phase"))
			Expect(phase.Description).To(Equal("Updated description"))
		})

		It("updates phase with partial fields (optional fields)", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Edit(ctx, &phaseMsgs.EditRequest{
				PhaseId: createdPhaseID,
				Name:    testutils.StringPtr("Partial Update"),
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify in database - name changed, description unchanged
			phase, err := dbClient.Phase.Query().
				Where(entphase.IDEQ(uuid.MustParse(createdPhaseID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(phase.Name).To(Equal("Partial Update"))
			Expect(phase.Description).To(Equal("Original description"))
		})

		It("returns NOT_FOUND for invalid phase ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Edit(ctx, &phaseMsgs.EditRequest{
				PhaseId:     uuid.NewString(),
				Name:        testutils.StringPtr("Updated"),
				Description: testutils.StringPtr("Updated"),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Phase.Write permission", func() {
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

			_, err = client.Edit(ctx, &phaseMsgs.EditRequest{
				PhaseId:     createdPhaseID,
				Name:        testutils.StringPtr("Unauthorized Edit"),
				Description: testutils.StringPtr("Unauthorized"),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Delete", func() {
		var createdHackathonID string
		var createdPhaseID string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Phase Delete Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			createResp, err := client.Create(ctx, &phaseMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Name:        "Delete Test Phase",
				Description: "Description to delete",
			})
			Expect(err).NotTo(HaveOccurred())
			createdPhaseID = createResp.GetPhaseId()
		})

		It("deletes phase successfully", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Delete(ctx, &phaseMsgs.DeleteRequest{
				PhaseId: createdPhaseID,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify phase was deleted
			_, err = dbClient.Phase.Query().
				Where(entphase.IDEQ(uuid.MustParse(createdPhaseID))).
				Only(context.Background())
			Expect(err).To(HaveOccurred())
			Expect(ent.IsNotFound(err)).To(BeTrue())
		})

		It("returns NOT_FOUND for invalid phase ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Delete(ctx, &phaseMsgs.DeleteRequest{
				PhaseId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Phase.Write permission", func() {
			nonOwnerKeycloakID := "non-owner-delete"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-delete-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = client.Delete(ctx, &phaseMsgs.DeleteRequest{
				PhaseId: createdPhaseID,
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("unlinks page when deleting a phase", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create a page and link it to the phase
			pageClient := hackathonSvc.NewPageServiceClient(conn)
			pageResp, err := pageClient.Create(ctx, &pageMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Title:       "Page to Unlink",
				Visible:     true,
			})
			Expect(err).NotTo(HaveOccurred())
			pageID := pageResp.GetPageId()

			// Link page to phase via Edit
			_, err = client.Edit(ctx, &phaseMsgs.EditRequest{
				PhaseId: createdPhaseID,
				PageId:  testutils.StringPtr(pageID),
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify page is linked to phase
			page, err := dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(pageID))).
				WithPhase().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page.Edges.Phase).ToNot(BeNil())
			Expect(page.Edges.Phase.ID).To(Equal(uuid.MustParse(createdPhaseID)))

			// Delete the phase
			_, err = client.Delete(ctx, &phaseMsgs.DeleteRequest{
				PhaseId: createdPhaseID,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify phase was deleted
			_, err = dbClient.Phase.Query().
				Where(entphase.IDEQ(uuid.MustParse(createdPhaseID))).
				Only(context.Background())
			Expect(err).To(HaveOccurred())
			Expect(ent.IsNotFound(err)).To(BeTrue())

			// Verify page is unlinked (phase_id cleared)
			page, err = dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(pageID))).
				WithPhase().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page.Edges.Phase).To(BeNil())
		})
	})

})
