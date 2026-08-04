//go:build test && unittest

package service_test

import (
	"context"
	"fmt"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	userSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/messages/user_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("UserService", func() {

	var (
		dbClient   *ent.Client
		conn       *grpc.ClientConn
		userClient userSvc.UserServiceClient
		testAdmin  string
	)

	BeforeEach(func() {
		dbClient, conn, _ = testutils.CreateTestServer()
		testAdmin = testutils.TestAdminKeycloakID
		userClient = userSvc.NewUserServiceClient(conn)
	})

	// ---- Get ----

	Describe("Get", func() {

		var targetUser *ent.User

		BeforeEach(func() {
			var err error
			targetUser, err = dbClient.User.Create().
				SetKeycloakID("get-target").
				SetUsername("get-target-username").
				SetDisplayName("Get Target").
				SetEmail("get@example.com").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
		})

		It("returns user with full details", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := userClient.Get(ctx, &msgs.GetRequest{
				UserId: targetUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())
			u := resp.GetUser()
			Expect(u.GetId()).To(Equal(targetUser.ID.String()))
			Expect(u.GetUsername()).To(Equal("get-target-username"))
			Expect(u.GetDisplayName()).To(Equal("Get Target"))
			Expect(u.GetEmail()).To(Equal("get@example.com"))
			Expect(u.GetKeycloakId()).To(Equal("get-target"))
			Expect(u.GetCreatedAt()).NotTo(BeNil())
			Expect(u.GetModifiedAt()).NotTo(BeNil())
		})

		It("returns user with roles populated", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Add a role first
			_, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).NotTo(HaveOccurred())

			resp, err := userClient.Get(ctx, &msgs.GetRequest{
				UserId: targetUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetUser().GetRoles()).To(ContainElement(ents.GlobalRole_GLOBAL_ROLE_ADMIN))
		})

		It("returns empty roles for user without any", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := userClient.Get(ctx, &msgs.GetRequest{
				UserId: targetUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetUser().GetRoles()).To(BeEmpty())
		})

		It("returns NOT_FOUND for non-existent user", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := userClient.Get(ctx, &msgs.GetRequest{
				UserId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns INVALID_ARGUMENT for invalid user ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := userClient.Get(ctx, &msgs.GetRequest{
				UserId: "not-a-uuid",
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("requires Read permission on User", func() {
			nonAdminKeycloakID := "non-admin-get"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("non-admin-get-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = userClient.Get(ctx, &msgs.GetRequest{
				UserId: targetUser.ID.String(),
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("denies anonymous requests", func() {
			_, err := userClient.Get(context.Background(), &msgs.GetRequest{
				UserId: targetUser.ID.String(),
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	// ---- WhoAmI ----

	Describe("WhoAmI", func() {

		It("returns the authenticated user", func() {
			keycloakID := "whoami-user"
			token := testutils.CreateTestJWTToken(keycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Pre-create the user in DB
			_, err := dbClient.User.Create().
				SetKeycloakID(keycloakID).
				SetUsername("whoami-username").
				SetDisplayName("Whoami User").
				SetEmail("whoami@example.com").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			resp, err := userClient.WhoAmI(ctx, &msgs.WhoAmIRequest{})
			Expect(err).NotTo(HaveOccurred())
			u := resp.GetUser()
			Expect(u.GetKeycloakId()).To(Equal(keycloakID))
			// Username falls back to Keycloak ID (sub) because test token
			// has no preferred_username claim.
			Expect(u.GetUsername()).To(Equal(keycloakID))
			// Display name and email fall back to empty strings.
			Expect(u.GetDisplayName()).To(BeEmpty())
			Expect(u.GetEmail()).To(BeEmpty())
			Expect(u.GetCreatedAt()).NotTo(BeNil())
			Expect(u.GetModifiedAt()).NotTo(BeNil())
		})

		It("returns user with roles", func() {
			keycloakID := "whoami-roles"
			token := testutils.CreateTestJWTToken(keycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			user, err := dbClient.User.Create().
				SetKeycloakID(keycloakID).
				SetUsername("whoami-roles-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Add role via admin
			adminToken := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+adminToken),
			)
			_, err = userClient.AddRole(adminCtx, &msgs.AddRoleRequest{
				UserId: user.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER,
			})
			Expect(err).NotTo(HaveOccurred())

			// Now call WhoAmI as the user
			resp, err := userClient.WhoAmI(ctx, &msgs.WhoAmIRequest{})
			Expect(err).NotTo(HaveOccurred())
			Expect(
				resp.GetUser().GetRoles(),
			).To(ContainElement(ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER))
		})

		It("returns NOT_FOUND when user is not registered", func() {
			token := testutils.CreateTestJWTToken("unregistered-user")
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := userClient.WhoAmI(ctx, &msgs.WhoAmIRequest{})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND for anonymous callers (user not registered)", func() {
			// Middleware injects anonymous claims (sub=anonymous), but the
			// anonymous user doesn't exist in the DB, so WhoAmI returns NotFound.
			_, err := userClient.WhoAmI(context.Background(), &msgs.WhoAmIRequest{})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})
	})

	// ---- Register ----

	Describe("Register", func() {

		It("creates a new user", func() {
			keycloakID := "register-new"
			token := testutils.CreateTestJWTToken(keycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := userClient.Register(ctx, &msgs.RegisterRequest{})
			Expect(err).NotTo(HaveOccurred())
			u := resp.GetUser()
			Expect(u.GetKeycloakId()).To(Equal(keycloakID))
			Expect(u.GetUsername()).To(Equal(keycloakID)) // falls back to sub
			Expect(u.GetCreatedAt()).NotTo(BeNil())
			Expect(u.GetModifiedAt()).NotTo(BeNil())

			// Verify in DB
			dbUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(keycloakID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(dbUser.KeycloakID).To(Equal(keycloakID))
			Expect(dbUser.Username).To(Equal(keycloakID))
		})

		It("is idempotent — returns existing user on second call", func() {
			keycloakID := "register-idempotent"
			token := testutils.CreateTestJWTToken(keycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First call creates the user
			resp1, err := userClient.Register(ctx, &msgs.RegisterRequest{})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp1.GetUser().GetKeycloakId()).To(Equal(keycloakID))

			// Second call returns the same user
			resp2, err := userClient.Register(ctx, &msgs.RegisterRequest{})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp2.GetUser().GetId()).To(Equal(resp1.GetUser().GetId()))
			Expect(resp2.GetUser().GetKeycloakId()).To(Equal(keycloakID))
		})

		It("syncs profile fields from Keycloak claims when they change", func() {
			keycloakID := "register-sync"
			token := testutils.CreateTestJWTToken(keycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create user with initial values
			_, err := dbClient.User.Create().
				SetKeycloakID(keycloakID).
				SetUsername("old-username").
				SetDisplayName("Old Display").
				SetEmail("old@example.com").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Register falls back to sub for username, empty for display/email
			resp, err := userClient.Register(ctx, &msgs.RegisterRequest{})
			Expect(err).NotTo(HaveOccurred())
			u := resp.GetUser()
			Expect(u.GetKeycloakId()).To(Equal(keycloakID))
			Expect(u.GetUsername()).To(Equal(keycloakID)) // updated from "old-username"
			Expect(u.GetDisplayName()).To(BeEmpty())
			Expect(u.GetEmail()).To(BeEmpty())
		})

		It("creates a user for anonymous callers", func() {
			// Register has no permission gate — it only requires a subject.
			// The middleware injects anonymous claims, so anonymous callers
			// can register (creating an anonymous user in the DB).
			resp, err := userClient.Register(context.Background(), &msgs.RegisterRequest{})
			Expect(err).NotTo(HaveOccurred())
			u := resp.GetUser()
			Expect(u.GetKeycloakId()).To(Equal("anonymous"))
			Expect(u.GetUsername()).To(Equal("anonymous"))
		})
	})

	// ---- List ----

	Describe("List", func() {

		var user1, user2 *ent.User

		BeforeEach(func() {
			var err error
			user1, err = dbClient.User.Create().
				SetKeycloakID("list-user-1").
				SetUsername("list-user-1-username").
				SetEmail("user1@example.com").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			user2, err = dbClient.User.Create().
				SetKeycloakID("list-user-2").
				SetUsername("list-user-2-username").
				SetEmail("user2@example.com").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
		})

		It("returns users with roles populated", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Assign admin role to user1
			_, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: user1.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).NotTo(HaveOccurred())

			// Assign organizer role to user2
			_, err = userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: user2.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER,
			})
			Expect(err).NotTo(HaveOccurred())

			resp, err := userClient.List(ctx, &msgs.ListRequest{})
			Expect(err).NotTo(HaveOccurred())

			// Find each user by keycloak ID
			var found1, found2 bool
			for _, u := range resp.GetUsers() {
				if u.GetKeycloakId() == "list-user-1" {
					found1 = true
					Expect(u.GetRoles()).To(ContainElement(ents.GlobalRole_GLOBAL_ROLE_ADMIN))
				}
				if u.GetKeycloakId() == "list-user-2" {
					found2 = true
					Expect(
						u.GetRoles(),
					).To(ContainElement(ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER))
				}
			}
			Expect(found1).To(BeTrue())
			Expect(found2).To(BeTrue())
		})

		It("returns empty roles for users without any global roles", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := userClient.List(ctx, &msgs.ListRequest{})
			Expect(err).NotTo(HaveOccurred())

			for _, u := range resp.GetUsers() {
				if u.GetKeycloakId() == "list-user-1" || u.GetKeycloakId() == "list-user-2" {
					Expect(u.GetRoles()).To(BeEmpty())
				}
			}
		})

		It("uses a single casbin call for all users", func() {
			// This test verifies correctness — if roles were fetched per-user
			// it would still work, but the implementation uses GetAllGlobalRoles.
			// We add roles to 5 users and verify they all appear correctly.
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			for i := 0; i < 5; i++ {
				u, err := dbClient.User.Create().
					SetKeycloakID(fmt.Sprintf("batch-user-%d", i)).
					SetUsername(fmt.Sprintf("batch-user-%d-username", i)).
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())

				_, err = userClient.AddRole(ctx, &msgs.AddRoleRequest{
					UserId: u.ID.String(),
					Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
				})
				Expect(err).NotTo(HaveOccurred())
			}

			resp, err := userClient.List(ctx, &msgs.ListRequest{})
			Expect(err).NotTo(HaveOccurred())

			for i := 0; i < 5; i++ {
				for _, u := range resp.GetUsers() {
					if u.GetKeycloakId() == fmt.Sprintf("batch-user-%d", i) {
						Expect(u.GetRoles()).To(ContainElement(ents.GlobalRole_GLOBAL_ROLE_ADMIN))
					}
				}
			}
		})
	})

	// ---- AddRole ----

	Describe("AddRole", func() {

		var targetUser *ent.User

		BeforeEach(func() {
			var err error
			targetUser, err = dbClient.User.Create().
				SetKeycloakID("addrole-target").
				SetUsername("addrole-target-username").
				SetEmail("target@example.com").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
		})

		It("adds admin role successfully", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetUser().GetId()).To(Equal(targetUser.ID.String()))
			Expect(resp.GetUser().GetRoles()).To(ContainElement(ents.GlobalRole_GLOBAL_ROLE_ADMIN))
		})

		It("adds hackathon organizer role successfully", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(
				resp.GetUser().GetRoles(),
			).To(ContainElement(ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER))
		})

		It("returns the user with all roles after adding", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Add admin first
			_, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).NotTo(HaveOccurred())

			// Add organizer second
			resp, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetUser().GetRoles()).To(ContainElements(
				ents.GlobalRole_GLOBAL_ROLE_ADMIN,
				ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER,
			))
		})

		It("returns NOT_FOUND for non-existent user", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: uuid.NewString(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns INVALID_ARGUMENT for invalid user ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: "not-a-uuid",
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("returns INVALID_ARGUMENT for unspecified role", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_UNSPECIFIED,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("denies anonymous requests", func() {
			// Middleware injects anonymous claims, so anonymous callers get
			// PermissionDenied (no Write permission on User for anonymous).
			_, err := userClient.AddRole(context.Background(), &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("requires Write permission on User", func() {
			nonAdminKeycloakID := "non-admin-addrole"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("non-admin-addrole-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	// ---- RemoveRole ----

	Describe("RemoveRole", func() {

		var targetUser *ent.User

		BeforeEach(func() {
			var err error
			targetUser, err = dbClient.User.Create().
				SetKeycloakID("removerole-target").
				SetUsername("removerole-target-username").
				SetEmail("removerole-target@example.com").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
		})

		It("removes admin role successfully", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First add admin role
			_, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).NotTo(HaveOccurred())

			// Then remove it
			resp, err := userClient.RemoveRole(ctx, &msgs.RemoveRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetUser().GetId()).To(Equal(targetUser.ID.String()))
			Expect(
				resp.GetUser().GetRoles(),
			).NotTo(ContainElement(ents.GlobalRole_GLOBAL_ROLE_ADMIN))
		})

		It("removes hackathon organizer role successfully", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First add organizer role
			_, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER,
			})
			Expect(err).NotTo(HaveOccurred())

			// Then remove it
			resp, err := userClient.RemoveRole(ctx, &msgs.RemoveRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(
				resp.GetUser().GetRoles(),
			).NotTo(ContainElement(ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER))
		})

		It("is idempotent when role is not assigned", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Remove role that was never assigned — should succeed
			resp, err := userClient.RemoveRole(ctx, &msgs.RemoveRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetUser().GetId()).To(Equal(targetUser.ID.String()))
			Expect(resp.GetUser().GetRoles()).To(BeEmpty())
		})

		It("returns NOT_FOUND for non-existent user", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := userClient.RemoveRole(ctx, &msgs.RemoveRoleRequest{
				UserId: uuid.NewString(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns INVALID_ARGUMENT for invalid user ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := userClient.RemoveRole(ctx, &msgs.RemoveRoleRequest{
				UserId: "not-a-uuid",
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("returns INVALID_ARGUMENT for unspecified role", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := userClient.RemoveRole(ctx, &msgs.RemoveRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_UNSPECIFIED,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("prevents a user from removing their own admin role", func() {
			// Ensure testAdmin has admin role
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First add admin role to testAdmin user
			adminDBUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(testAdmin)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())

			_, err = userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: adminDBUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).NotTo(HaveOccurred())

			// Now try to remove it
			_, err = userClient.RemoveRole(ctx, &msgs.RemoveRoleRequest{
				UserId: adminDBUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("allows removing admin role from another user", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Add admin role to target user
			_, err := userClient.AddRole(ctx, &msgs.AddRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).NotTo(HaveOccurred())

			// Remove it — should succeed because caller is not the target
			resp, err := userClient.RemoveRole(ctx, &msgs.RemoveRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(
				resp.GetUser().GetRoles(),
			).NotTo(ContainElement(ents.GlobalRole_GLOBAL_ROLE_ADMIN))
		})

		It("denies anonymous requests", func() {
			// Middleware injects anonymous claims, so anonymous callers get
			// PermissionDenied (no Write permission on User for anonymous).
			_, err := userClient.RemoveRole(context.Background(), &msgs.RemoveRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("requires Write permission on User", func() {
			nonAdminKeycloakID := "non-admin-removerole"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("non-admin-removerole-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = userClient.RemoveRole(ctx, &msgs.RemoveRoleRequest{
				UserId: targetUser.ID.String(),
				Role:   ents.GlobalRole_GLOBAL_ROLE_ADMIN,
			})
			Expect(err).To(HaveOccurred())
			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})
})
