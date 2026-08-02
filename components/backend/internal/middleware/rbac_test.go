//go:build test && unittest

package middleware_test

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	. "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var _ = Describe("RBAC Enforcer", func() {

	Describe("NewRBACEnforcer", func() {
		It("creates enforcer with admin policy", func() {
			adminID := "admin-uuid"
			enf := testutils.NewMockEnforcer(adminID)

			ctx := CtxWithClaims(adminID)
			adminCanReadUsers, err := enf.Enforce(ctx, "any", User, Read)
			Expect(err).NotTo(HaveOccurred())
			Expect(adminCanReadUsers).To(BeTrue())
		})
	})

	Describe("Role-based Access", func() {
		var enf *Enforcer

		BeforeEach(func() {
			enf = testutils.NewMockEnforcer("admin-uuid")

			_, err := enf.AddRole("alice", Owner, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("alice", Owner, "h1")
			})

			_, err = enf.AddRole("bob", Member, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("bob", Member, "h1")
			})

			_, err = enf.AddRole("eve", Owner, "h2")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("eve", Owner, "h2")
			})
		})

		DescribeTable(
			"enforce permissions",
			func(user, hackathon string, objectType ObjectType, permission Permission, expected bool) {
				ctx := CtxWithClaims(user)
				allowed, err := enf.Enforce(ctx, hackathon, objectType, permission)
				Expect(err).NotTo(HaveOccurred())
				Expect(allowed).To(BeEquivalentTo(expected))
			},
			Entry("alice owner reads h1", "alice", "h1", Hackathon, Read, true),
			Entry("alice owner writes h1", "alice", "h1", Hackathon, Write, true),
			Entry("alice cannot read h2", "alice", "h2", Hackathon, Read, false),
			Entry("bob member reads h1", "bob", "h1", Hackathon, Read, true),
			Entry("bob member cannot write h1", "bob", "h1", Hackathon, Write, false),
			Entry("bob cannot read h2", "bob", "h2", Hackathon, Read, false),
			Entry("eve owner reads h2", "eve", "h2", Hackathon, Read, true),
			Entry("eve owner writes h2", "eve", "h2", Hackathon, Write, true),
			Entry("eve cannot read h1", "eve", "h1", Hackathon, Read, false),
		)
	})

	Describe("Public Hackathon Access", func() {
		var enf *Enforcer

		BeforeEach(func() {
			enf = testutils.NewMockEnforcer("admin-uuid")

			_, err := enf.AllowPublicHackathonAccess("h2")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemovePublicHackathonAccess("h2")
			})

			_, err = enf.AddRole("alice", Owner, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("alice", Owner, "h1")
			})

			_, err = enf.AddRole("bob", Member, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("bob", Member, "h1")
			})

			_, err = enf.AddRole("eve", Owner, "h2")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("eve", Owner, "h2")
			})
		})

		DescribeTable(
			"enforce permissions with public hackathon",
			func(user, hackathon string, objectType ObjectType, permission Permission, expected bool) {
				ctx := CtxWithClaims(user)
				allowed, err := enf.Enforce(ctx, hackathon, objectType, permission)
				Expect(err).NotTo(HaveOccurred())
				Expect(allowed).To(BeEquivalentTo(expected))
			},
			Entry("alice can read public h2", "alice", "h2", Hackathon, Read, true),
			Entry("alice can't write public h1", "alice", "h1", Hackathon, Write, true),
			Entry("bob can read public h2", "bob", "h1", Hackathon, Read, true),
			Entry("bob can't write public h1", "bob", "h1", Hackathon, Write, false),
			Entry("eve owner reads h2", "eve", "h2", Hackathon, Read, true),
			Entry("eve owner writes h2", "eve", "h2", Hackathon, Write, true),
			Entry("eve cannot read h1", "eve", "h1", Hackathon, Read, false),
		)
	})

	Describe("Admin Access", func() {
		adminID := "admin-uuid"

		DescribeTable("admin bypasses checks",
			func(objectType ObjectType, permission Permission, expected bool) {
				enf := testutils.NewMockEnforcer(adminID)
				ctx := CtxWithClaims(adminID)

				allowed, err := enf.Enforce(ctx, "any", objectType, permission)
				Expect(err).NotTo(HaveOccurred())
				Expect(allowed).To(BeEquivalentTo(expected))
			},
			Entry("reads users", User, Read, true),
			Entry("reads hackathons", Hackathon, Read, true),
			Entry("writes hackathons", Hackathon, Write, true),
		)
	})

	Describe("Global Roles", func() {
		organizerID := "organizer-uuid"

		It("lets a global organizer create hackathons", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")
			_, err := enf.AddGlobalRole(organizerID, HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			allowed, err := enf.CheckPermission(organizerID, "*", Hackathon, Create)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())
		})

		It("keeps a global organizer out of an individual hackathon", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")
			_, err := enf.AddGlobalRole(organizerID, HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			allowed, err := enf.CheckPermission(organizerID, "h1", Hackathon, Write)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeFalse())
		})

		DescribeTable("refuses to grant a hackathon-scoped role globally",
			func(role Role) {
				enf := testutils.NewMockEnforcer("admin-uuid")

				_, err := enf.AddGlobalRole("mallory", role)
				Expect(err).To(MatchError(ErrNotAGlobalRole))

				allowed, err := enf.CheckPermission("mallory", "h1", Hackathon, Write)
				Expect(err).NotTo(HaveOccurred())
				Expect(allowed).To(BeFalse())
			},
			Entry("owner", Owner),
			Entry("member", Member),
		)
	})

	Describe("RequirePermission", func() {
		var enf *Enforcer
		adminID := "admin-uuid"
		BeforeEach(func() {
			enf = testutils.NewMockEnforcer(adminID)

			_, err := enf.AddRole("uuid-alice", Owner, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("uuid-alice", Owner, "h1")
			})

		})

		It("allows owner to read their hackathon", func() {
			ctx := CtxWithClaims("uuid-alice")
			err := enf.RequirePermission(ctx, "h1", Hackathon, Read)
			Expect(err).NotTo(HaveOccurred())
		})

		It("denies unauthorized access", func() {
			ctx := CtxWithClaims("uuid-nobody")
			err := enf.RequirePermission(ctx, "h1", Hackathon, Read)
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})

		It("allows admin to bypass", func() {
			ctx := CtxWithClaims(adminID)
			err := enf.RequirePermission(ctx, "any", Hackathon, Read)
			Expect(err).NotTo(HaveOccurred())
		})

		It("returns internal error when no JWT claims", func() {
			ctx := context.Background()
			err := enf.RequirePermission(ctx, "h1", Hackathon, Read)
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.Internal))
		})
	})

	Describe("Admin Keycloak ID Resolution", func() {
		var enf *Enforcer
		adminID := "admin-uuid"
		BeforeEach(func() {
			enf = testutils.NewMockEnforcer(adminID)

			_, err := enf.AddRole("uuid-alice", Owner, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("uuid-alice", Owner, "h1")
			})
		})
		It("Admin Keycloak ID matches g2 policy", func() {
			ctx := CtxWithClaims(adminID)
			allowed, err := enf.Enforce(ctx, "any", User, Read)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())
		})

		It("Owner matched by sub UUID directly", func() {
			ctx := CtxWithClaims("uuid-alice")
			allowed, err := enf.Enforce(ctx, "h1", Hackathon, Read)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())
		})

		It("Unknown UUID is denied", func() {
			ctx := CtxWithClaims("uuid-nobody")
			allowed, err := enf.Enforce(ctx, "h1", Hackathon, Read)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeFalse())
		})
	})

})
