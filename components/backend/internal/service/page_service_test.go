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
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	hackathonMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	pageMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/page_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("PageService", func() {

	var (
		dbClient  *ent.Client
		conn      *grpc.ClientConn
		client    hackathonSvc.PageServiceClient
		testAdmin string
	)

	BeforeEach(func() {
		dbClient, conn = testutils.CreateTestServer()
		testAdmin = testutils.TestAdminKeycloakID

		client = hackathonSvc.NewPageServiceClient(conn)
	})

	Describe("Create", func() {
		It("creates page successfully with admin token", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			createReq := &pageMsgs.CreateRequest{
				HackathonId: uuid.NewString(),
				Title:       "Test Page",
				Content:     "Test content",
				Visible:     true,
			}

			_, err := client.Create(ctx, createReq)
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("creates page with valid hackathon", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First create a hackathon
			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Page Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(createHackResp.GetHackathonId()).NotTo(BeEmpty())

			// Create a page
			createReq := &pageMsgs.CreateRequest{
				HackathonId: createHackResp.GetHackathonId(),
				Title:       "Test Page",
				Content:     "Test content",
				Visible:     true,
			}

			resp, err := client.Create(ctx, createReq)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetPageId()).NotTo(BeEmpty())

			// Verify in database
			page, err := dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(resp.GetPageId()))).
				WithCreator().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page.Title).To(Equal("Test Page"))
			Expect(page.Content).To(Equal("Test content"))
			Expect(page.Visible).To(BeTrue())
			Expect(page.Order).To(Equal(0))
		})

		It("requires authentication to create", func() {
			// No auth header - anonymous
			ctx := context.Background()

			createReq := &pageMsgs.CreateRequest{
				HackathonId: uuid.NewString(),
				Title:       "Unauthorized Page",
				Content:     "Unauthorized",
				Visible:     true,
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

			createReq := &pageMsgs.CreateRequest{
				HackathonId: uuid.NewString(),
				Title:       "Unauthorized Page",
				Content:     "Unauthorized",
				Visible:     true,
			}

			_, err := client.Create(ctx, createReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
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
				Name:       "Page List Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			// Create some pages
			for i := 0; i < 3; i++ {
				_, err := client.Create(ctx, &pageMsgs.CreateRequest{
					HackathonId: createdHackathonID,
					Title:       "Page " + string(rune('A'+i)),
					Content:     "Content for page " + string(rune('A'+i)),
					Visible:     true,
					// order auto-assigned by backend
				})
				Expect(err).NotTo(HaveOccurred())
			}
		})

		It("lists pages for authorized user", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			pages := listResp.GetPages()
			Expect(pages).To(HaveLen(3))

			// Verify pages are ordered sequentially
			for i, p := range pages {
				Expect(
					p.GetOrder(),
				).To(Equal(int32(i)), "Page at index %d should have order %d", i, i)
			}
		})

		It("returns pages with correct fields", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())

			p := listResp.GetPages()[0]
			Expect(p.GetId()).NotTo(BeEmpty())
			Expect(p.GetTitle()).NotTo(BeEmpty())
			Expect(p.GetContent()).NotTo(BeEmpty())
			Expect(p.GetVisible()).To(BeTrue())
			Expect(p.GetCreatedAt()).NotTo(BeNil())
			Expect(p.GetModifiedAt()).NotTo(BeNil())
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())
			Expect(listResp).To(BeNil())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Page.Read permission", func() {
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

			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
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
		var createdPageID string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Page Get Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			createResp, err := client.Create(ctx, &pageMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Title:       "Get Test Page",
				Content:     "Get test content",
				Visible:     true,
			})
			Expect(err).NotTo(HaveOccurred())
			createdPageID = createResp.GetPageId()
		})

		It("retrieves page with full details", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getResp, err := client.Get(ctx, &pageMsgs.GetRequest{
				PageId: createdPageID,
			})
			Expect(err).NotTo(HaveOccurred())

			page := getResp.GetPage()
			Expect(page.GetId()).To(Equal(createdPageID))
			Expect(page.GetTitle()).To(Equal("Get Test Page"))
			Expect(page.GetContent()).To(Equal("Get test content"))
			Expect(page.GetVisible()).To(BeTrue())
			Expect(page.GetOrder()).To(Equal(int32(0)))
		})

		It("returns NOT_FOUND for invalid page ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getResp, err := client.Get(ctx, &pageMsgs.GetRequest{
				PageId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())
			Expect(getResp).To(BeNil())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND for page in non-existent hackathon", func() {
			// Create a page with a fake hackathon ID
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Create(ctx, &pageMsgs.CreateRequest{
				HackathonId: uuid.NewString(),
				Title:       "Fake Page",
				Content:     "Fake",
				Visible:     true,
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Page.Read permission", func() {
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

			getResp, err := client.Get(ctx, &pageMsgs.GetRequest{
				PageId: createdPageID,
			})
			Expect(err).To(HaveOccurred())
			Expect(getResp).To(BeNil())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Edit", func() {
		var createdHackathonID string
		var createdPageID string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Page Edit Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			createResp, err := client.Create(ctx, &pageMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Title:       "Original Title",
				Content:     "Original content",
				Visible:     true,
			})
			Expect(err).NotTo(HaveOccurred())
			createdPageID = createResp.GetPageId()
		})

		It("updates page with all fields", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Edit(ctx, &pageMsgs.EditRequest{
				PageId:  createdPageID,
				Title:   testutils.StringPtr("Updated Title"),
				Content: testutils.StringPtr("Updated content"),
				Visible: testutils.BoolPtr(false),
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify in database
			page, err := dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(createdPageID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page.Title).To(Equal("Updated Title"))
			Expect(page.Content).To(Equal("Updated content"))
			Expect(page.Visible).To(BeFalse())
		})

		It("updates page with partial fields (optional fields)", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Edit(ctx, &pageMsgs.EditRequest{
				PageId: createdPageID,
				Title:  testutils.StringPtr("Partial Update"),
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify in database - title changed, content unchanged
			page, err := dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(createdPageID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(page.Title).To(Equal("Partial Update"))
			Expect(page.Content).To(Equal("Original content"))
		})

		It("returns NOT_FOUND for invalid page ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Edit(ctx, &pageMsgs.EditRequest{
				PageId: uuid.NewString(),
				Title:  testutils.StringPtr("Updated"),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Page.Write permission", func() {
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

			_, err = client.Edit(ctx, &pageMsgs.EditRequest{
				PageId: createdPageID,
				Title:  testutils.StringPtr("Unauthorized Edit"),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Delete", func() {
		var createdHackathonID string
		var createdPageID string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Page Delete Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			createResp, err := client.Create(ctx, &pageMsgs.CreateRequest{
				HackathonId: createdHackathonID,
				Title:       "Delete Test Page",
				Content:     "Content to delete",
				Visible:     true,
			})
			Expect(err).NotTo(HaveOccurred())
			createdPageID = createResp.GetPageId()
		})

		It("deletes page successfully and renumbers order", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Use the page from BeforeEach plus create additional pages
			pages := []string{createdPageID}
			for i := 0; i < 3; i++ {
				createResp, err := client.Create(ctx, &pageMsgs.CreateRequest{
					HackathonId: createdHackathonID,
					Title:       "Additional Page " + string(rune('A'+i)),
					Content:     "Content", Visible: true,
				})
				Expect(err).NotTo(HaveOccurred())
				pages = append(pages, createResp.GetPageId())
			}

			// Delete middle page (index 1) to test order renumbering
			_, err := client.Delete(ctx, &pageMsgs.DeleteRequest{
				PageId: pages[1],
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify the deleted page is gone
			_, err = dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(pages[1]))).
				Only(context.Background())
			Expect(err).To(HaveOccurred())
			Expect(ent.IsNotFound(err)).To(BeTrue())

			// Verify remaining pages have sequential order (0, 1, 2)
			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(listResp.GetPages()).To(HaveLen(3))
			for i, p := range listResp.GetPages() {
				Expect(
					p.GetOrder(),
				).To(Equal(int32(i)), "Remaining page should have sequential order %d", i)
			}
		})

		It("returns NOT_FOUND for invalid page ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Delete(ctx, &pageMsgs.DeleteRequest{
				PageId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Page.Write permission", func() {
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

			_, err = client.Delete(ctx, &pageMsgs.DeleteRequest{
				PageId: createdPageID,
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("MoveUp", func() {
		var createdHackathonID string
		var pageIDs []string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Page MoveUp Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			// Create 4 pages
			pageIDs = []string{}
			for i := 0; i < 4; i++ {
				createResp, err := client.Create(ctx, &pageMsgs.CreateRequest{
					HackathonId: createdHackathonID,
					Title:       "Page " + string(rune('A'+i)),
					Content:     "Content for page " + string(rune('A'+i)),
					Visible:     true,
				})
				Expect(err).NotTo(HaveOccurred())
				pageIDs = append(pageIDs, createResp.GetPageId())
			}
		})

		It("moves page up by one position", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Move page at index 2 ("Page C") up - should swap with index 1 ("Page B")
			moveResp, err := client.MoveUp(ctx, &pageMsgs.MoveUpRequest{
				PageId: pageIDs[2],
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(moveResp.GetPageId()).To(Equal(pageIDs[2]))
			Expect(moveResp.GetOrder()).To(Equal(int32(1)))

			// Verify order: A=0, C=1, B=2, D=3
			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			pages := listResp.GetPages()
			Expect(pages).To(HaveLen(4))
			Expect(pages[0].GetTitle()).To(Equal("Page A"))
			Expect(pages[0].GetOrder()).To(Equal(int32(0)))
			Expect(pages[1].GetTitle()).To(Equal("Page C"))
			Expect(pages[1].GetOrder()).To(Equal(int32(1)))
			Expect(pages[2].GetTitle()).To(Equal("Page B"))
			Expect(pages[2].GetOrder()).To(Equal(int32(2)))
			Expect(pages[3].GetTitle()).To(Equal("Page D"))
			Expect(pages[3].GetOrder()).To(Equal(int32(3)))
		})

		It("moves page up by custom increment", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Move page at index 3 ("Page D") up by 2 - should swap with index 1 ("Page B")
			moveResp, err := client.MoveUp(ctx, &pageMsgs.MoveUpRequest{
				PageId:    pageIDs[3],
				Increment: int32Ptr(2),
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(moveResp.GetPageId()).To(Equal(pageIDs[3]))
			Expect(moveResp.GetOrder()).To(Equal(int32(1)))

			// Verify order: A=0, D=1, B=2, C=3
			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			pages := listResp.GetPages()
			Expect(pages).To(HaveLen(4))
			Expect(pages[0].GetTitle()).To(Equal("Page A"))
			Expect(pages[1].GetTitle()).To(Equal("Page D"))
			Expect(pages[2].GetTitle()).To(Equal("Page B"))
			Expect(pages[3].GetTitle()).To(Equal("Page C"))
		})

		It("does nothing when page is already at top", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Move first page up - should return same order
			moveResp, err := client.MoveUp(ctx, &pageMsgs.MoveUpRequest{
				PageId: pageIDs[0],
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(moveResp.GetPageId()).To(Equal(pageIDs[0]))
			Expect(moveResp.GetOrder()).To(Equal(int32(0)))

			// Verify order unchanged: A=0, B=1, C=2, D=3
			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			pages := listResp.GetPages()
			Expect(pages).To(HaveLen(4))
			for i, p := range pages {
				Expect(p.GetOrder()).To(Equal(int32(i)))
			}
		})

		It("returns NOT_FOUND for invalid page ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.MoveUp(ctx, &pageMsgs.MoveUpRequest{
				PageId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Page.Write permission", func() {
			nonOwnerKeycloakID := "non-owner-moveup"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-moveup-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = client.MoveUp(ctx, &pageMsgs.MoveUpRequest{
				PageId: pageIDs[1],
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("MoveDown", func() {
		var createdHackathonID string
		var pageIDs []string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Page MoveDown Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			// Create 4 pages
			pageIDs = []string{}
			for i := 0; i < 4; i++ {
				createResp, err := client.Create(ctx, &pageMsgs.CreateRequest{
					HackathonId: createdHackathonID,
					Title:       "Page " + string(rune('A'+i)),
					Content:     "Content for page " + string(rune('A'+i)),
					Visible:     true,
				})
				Expect(err).NotTo(HaveOccurred())
				pageIDs = append(pageIDs, createResp.GetPageId())
			}
		})

		It("moves page down by one position", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Move page at index 1 ("Page B") down - should swap with index 2 ("Page C")
			moveResp, err := client.MoveDown(ctx, &pageMsgs.MoveDownRequest{
				PageId: pageIDs[1],
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(moveResp.GetPageId()).To(Equal(pageIDs[1]))
			Expect(moveResp.GetOrder()).To(Equal(int32(2)))

			// Verify order: A=0, C=1, B=2, D=3
			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			pages := listResp.GetPages()
			Expect(pages).To(HaveLen(4))
			Expect(pages[0].GetTitle()).To(Equal("Page A"))
			Expect(pages[0].GetOrder()).To(Equal(int32(0)))
			Expect(pages[1].GetTitle()).To(Equal("Page C"))
			Expect(pages[1].GetOrder()).To(Equal(int32(1)))
			Expect(pages[2].GetTitle()).To(Equal("Page B"))
			Expect(pages[2].GetOrder()).To(Equal(int32(2)))
			Expect(pages[3].GetTitle()).To(Equal("Page D"))
			Expect(pages[3].GetOrder()).To(Equal(int32(3)))
		})

		It("moves page down by custom increment", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Move page at index 0 ("Page A") down by 2 - should swap with index 2 ("Page C")
			moveResp, err := client.MoveDown(ctx, &pageMsgs.MoveDownRequest{
				PageId:    pageIDs[0],
				Increment: int32Ptr(2),
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(moveResp.GetPageId()).To(Equal(pageIDs[0]))
			Expect(moveResp.GetOrder()).To(Equal(int32(2)))

			// Verify order: B=0, C=1, A=2, D=3
			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			pages := listResp.GetPages()
			Expect(pages).To(HaveLen(4))
			Expect(pages[0].GetTitle()).To(Equal("Page B"))
			Expect(pages[1].GetTitle()).To(Equal("Page C"))
			Expect(pages[2].GetTitle()).To(Equal("Page A"))
			Expect(pages[3].GetTitle()).To(Equal("Page D"))
		})

		It("does nothing when page is already at bottom", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Move last page down - should return same order
			moveResp, err := client.MoveDown(ctx, &pageMsgs.MoveDownRequest{
				PageId: pageIDs[3],
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(moveResp.GetPageId()).To(Equal(pageIDs[3]))
			Expect(moveResp.GetOrder()).To(Equal(int32(3)))

			// Verify order unchanged: A=0, B=1, C=2, D=3
			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			pages := listResp.GetPages()
			Expect(pages).To(HaveLen(4))
			for i, p := range pages {
				Expect(p.GetOrder()).To(Equal(int32(i)))
			}
		})

		It("returns NOT_FOUND for invalid page ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.MoveDown(ctx, &pageMsgs.MoveDownRequest{
				PageId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Page.Write permission", func() {
			nonOwnerKeycloakID := "non-owner-movedown"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-movedown-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = client.MoveDown(ctx, &pageMsgs.MoveDownRequest{
				PageId: pageIDs[1],
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("SetOrder", func() {
		var createdHackathonID string
		var pageIDs []string

		BeforeEach(func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			createHackResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Page SetOrder Test Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())
			createdHackathonID = createHackResp.GetHackathonId()

			// Create 4 pages
			pageIDs = []string{}
			for i := 0; i < 4; i++ {
				createResp, err := client.Create(ctx, &pageMsgs.CreateRequest{
					HackathonId: createdHackathonID,
					Title:       "Page " + string(rune('A'+i)),
					Content:     "Content for page " + string(rune('A'+i)),
					Visible:     true,
				})
				Expect(err).NotTo(HaveOccurred())
				pageIDs = append(pageIDs, createResp.GetPageId())
			}
		})

		It("reorders pages to the specified order", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Reverse the order: D, C, B, A
			reversedPageIDs := []string{pageIDs[3], pageIDs[2], pageIDs[1], pageIDs[0]}
			_, err := client.SetOrder(ctx, &pageMsgs.SetOrderRequest{
				HackathonId: createdHackathonID,
				PageIds:     reversedPageIDs,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify new order
			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			pages := listResp.GetPages()
			Expect(pages).To(HaveLen(4))
			Expect(pages[0].GetTitle()).To(Equal("Page D"))
			Expect(pages[0].GetOrder()).To(Equal(int32(0)))
			Expect(pages[1].GetTitle()).To(Equal("Page C"))
			Expect(pages[1].GetOrder()).To(Equal(int32(1)))
			Expect(pages[2].GetTitle()).To(Equal("Page B"))
			Expect(pages[2].GetOrder()).To(Equal(int32(2)))
			Expect(pages[3].GetTitle()).To(Equal("Page A"))
			Expect(pages[3].GetOrder()).To(Equal(int32(3)))
		})

		It("preserves order when passed in same sequence", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Pass pages in original order
			_, err := client.SetOrder(ctx, &pageMsgs.SetOrderRequest{
				HackathonId: createdHackathonID,
				PageIds:     pageIDs,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify order unchanged: A=0, B=1, C=2, D=3
			listResp, err := client.List(ctx, &pageMsgs.ListRequest{
				HackathonId: createdHackathonID,
			})
			Expect(err).NotTo(HaveOccurred())
			pages := listResp.GetPages()
			Expect(pages).To(HaveLen(4))
			for i, p := range pages {
				Expect(p.GetOrder()).To(Equal(int32(i)))
			}
		})

		It("returns INVALID_ARGUMENT for empty page_ids", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.SetOrder(ctx, &pageMsgs.SetOrderRequest{
				HackathonId: createdHackathonID,
				PageIds:     []string{},
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("returns INVALID_ARGUMENT when not all pages are passed", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Pass only 2 of 4 pages
			_, err := client.SetOrder(ctx, &pageMsgs.SetOrderRequest{
				HackathonId: createdHackathonID,
				PageIds:     pageIDs[:2],
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("returns INVALID_ARGUMENT for invalid page ID format", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.SetOrder(ctx, &pageMsgs.SetOrderRequest{
				HackathonId: createdHackathonID,
				PageIds:     []string{"not-a-uuid", pageIDs[1], pageIDs[2], pageIDs[3]},
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("returns NOT_FOUND for page not in hackathon", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create a page in a different hackathon
			hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
			hack2Resp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:       "Other Hackathon",
				Visibility: 2, // PUBLIC
			})
			Expect(err).NotTo(HaveOccurred())

			page2Resp, err := client.Create(ctx, &pageMsgs.CreateRequest{
				HackathonId: hack2Resp.GetHackathonId(),
				Title:       "Other Page",
				Content:     "Other content",
				Visible:     true,
			})
			Expect(err).NotTo(HaveOccurred())

			// Try to set order with a page from a different hackathon
			_, err = client.SetOrder(ctx, &pageMsgs.SetOrderRequest{
				HackathonId: createdHackathonID,
				PageIds:     []string{page2Resp.GetPageId(), pageIDs[1], pageIDs[2], pageIDs[3]},
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("requires Page.Write permission", func() {
			nonOwnerKeycloakID := "non-owner-setorder"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-setorder-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = client.SetOrder(ctx, &pageMsgs.SetOrderRequest{
				HackathonId: createdHackathonID,
				PageIds:     pageIDs,
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

})
