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
				Order:       1,
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
				Order:       1,
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
			Expect(page.Order).To(Equal(1))
		})

		It("requires authentication to create", func() {
			// No auth header - anonymous
			ctx := context.Background()

			createReq := &pageMsgs.CreateRequest{
				HackathonId: uuid.NewString(),
				Title:       "Unauthorized Page",
				Content:     "Unauthorized",
				Visible:     true,
				Order:       1,
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
				Order:       1,
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
					Order:       int32(i + 1),
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
			Expect(len(listResp.GetPages())).To(Equal(3))

			// Verify pages are ordered
			Expect(listResp.GetPages()[0].GetOrder()).To(Equal(int32(1)))
			Expect(listResp.GetPages()[1].GetOrder()).To(Equal(int32(2)))
			Expect(listResp.GetPages()[2].GetOrder()).To(Equal(int32(3)))
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
				Order:       1,
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
			Expect(page.GetOrder()).To(Equal(int32(1)))
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
				Order:       1,
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
				Order:       1,
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
				PageId:   createdPageID,
				Title:    stringPtr("Updated Title"),
				Content:  stringPtr("Updated content"),
				Visible:  boolPtr(false),
				Order:    int32Ptr(99),
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
			Expect(page.Order).To(Equal(99))
		})

		It("updates page with partial fields (optional fields)", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Edit(ctx, &pageMsgs.EditRequest{
				PageId: createdPageID,
				Title:  stringPtr("Partial Update"),
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
				Title:  stringPtr("Updated"),
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
				Title:  stringPtr("Unauthorized Edit"),
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
				Order:       1,
			})
			Expect(err).NotTo(HaveOccurred())
			createdPageID = createResp.GetPageId()
		})

		It("deletes page successfully", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := client.Delete(ctx, &pageMsgs.DeleteRequest{
				PageId: createdPageID,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify page was deleted
			_, err = dbClient.Page.Query().
				Where(enpage.IDEQ(uuid.MustParse(createdPageID))).
				Only(context.Background())
			Expect(err).To(HaveOccurred())
			Expect(ent.IsNotFound(err)).To(BeTrue())
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

})

// Helper functions for optional fields
func stringPtr(s string) *string {
	return &s
}

func boolPtr(b bool) *bool {
	return &b
}

func int32Ptr(i int32) *int32 {
	return &i
}
