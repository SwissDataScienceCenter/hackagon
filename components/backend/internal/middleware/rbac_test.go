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

	Describe("AddPolicy / RemovePolicy with domain options", func() {
		It("adds policy with team wildcard domain", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			err := enf.AddPolicy(nil, "h1", Submission, Create, WithTeam("*"))
			Expect(err).NotTo(HaveOccurred())

			// Wildcard should match any team
			ctx := CtxWithClaims("anonymous-user")
			allowed, err := enf.Enforce(ctx, "h1", Submission, Create, WithTeam("any-team"))
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())

			// Cleanup
			enf.RemovePolicy(nil, "h1", Submission, Create, WithTeam("*"))
		})

		It("adds policy with specific team domain", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			// Map user to member role with the full team domain
			_, err := enf.AddRole("member-user", Member, "h1", WithTeam("team-123"))
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("member-user", Member, "h1", WithTeam("*"))
			})

			memberRole := Member
			err = enf.AddPolicy(&memberRole, "h1", Submission, Create, WithTeam("team-123"))
			Expect(err).NotTo(HaveOccurred())

			// Should match the specific team
			ctx := CtxWithClaims("member-user")
			allowed, err := enf.Enforce(ctx, "h1", Submission, Create, WithTeam("team-123"))
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())

			// Should NOT match a different team
			differentAllowed, err := enf.Enforce(
				ctx,
				"h1",
				Submission,
				Create,
				WithTeam("team-456"),
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(differentAllowed).To(BeFalse())

			// Cleanup
			enf.RemovePolicy(&memberRole, "h1", Submission, Create, WithTeam("team-123"))
		})

		It("removes policy with matching domain", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			// Map user to member role with the full project domain
			_, err := enf.AddRole("member-user", Member, "h1", WithProject("proj-1"))
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("member-user", Member, "h1", WithProject("proj-1"))
			})

			memberRole := Member
			err = enf.AddPolicy(&memberRole, "h1", Project, Propose, WithProject("proj-1"))
			Expect(err).NotTo(HaveOccurred())

			// Initially allowed
			ctx := CtxWithClaims("member-user")
			allowed, err := enf.Enforce(ctx, "h1", Project, Propose, WithProject("proj-1"))
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())

			// Remove and verify denied
			enf.RemovePolicy(&memberRole, "h1", Project, Propose, WithProject("proj-1"))
			denied, err := enf.Enforce(ctx, "h1", Project, Propose, WithProject("proj-1"))
			Expect(err).NotTo(HaveOccurred())
			Expect(denied).To(BeFalse())
		})

		It("handles nil role for wildcard policy removal", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			err := enf.AddPolicy(nil, "h1", Hackathon, Join)
			Expect(err).NotTo(HaveOccurred())

			// Initially allowed for anonymous
			ctx := CtxWithClaims("anonymous")
			allowed, err := enf.Enforce(ctx, "h1", Hackathon, Join)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())

			// Remove with nil role
			enf.RemovePolicy(nil, "h1", Hackathon, Join)
			denied, err := enf.Enforce(ctx, "h1", Hackathon, Join)
			Expect(err).NotTo(HaveOccurred())
			Expect(denied).To(BeFalse())
		})
	})

	Describe("Capability-based permissions", func() {
		It("register capability allows anonymous join", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			// Add register capability policy (wildcard)
			err := enf.AddPolicy(nil, "h1", Hackathon, Join)
			Expect(err).NotTo(HaveOccurred())

			// Anonymous should be able to join
			ctx := CtxWithClaims("anonymous-user")
			allowed, err := enf.Enforce(ctx, "h1", Hackathon, Join)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())

			// Cleanup
			enf.RemovePolicy(nil, "h1", Hackathon, Join)
		})

		It("propose capability gates member project proposals", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			// Map user to member role
			_, err := enf.AddRole("member-user", Member, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("member-user", Member, "h1")
			})

			// Member without propose capability should be denied
			ctx := CtxWithClaims("member-user")
			allowed, err := enf.Enforce(ctx, "h1", Project, Propose)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeFalse())

			// Add propose capability for member
			memberRole := Member
			err = enf.AddPolicy(&memberRole, "h1", Project, Propose)
			Expect(err).NotTo(HaveOccurred())

			// Now member should be allowed
			allowed, err = enf.Enforce(ctx, "h1", Project, Propose)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())

			// Cleanup
			enf.RemovePolicy(&memberRole, "h1", Project, Propose)
		})

		It("owner propose is independent of capability", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			// Add owner role
			_, err := enf.AddRole("owner-user", Owner, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("owner-user", Owner, "h1")
			})

			// Owner should be able to propose regardless of capability
			ctx := CtxWithClaims("owner-user")
			allowed, err := enf.Enforce(ctx, "h1", Project, Propose)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())
		})

		It("team preferences capability gates project join", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			// Map user to member role
			_, err := enf.AddRole("member-user", Member, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("member-user", Member, "h1")
			})

			// Member without team preferences should be denied
			ctx := CtxWithClaims("member-user")
			allowed, err := enf.Enforce(ctx, "h1", Project, Join)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeFalse())

			// Add team preferences capability for member
			memberRole := Member
			err = enf.AddPolicy(&memberRole, "h1", Project, Join)
			Expect(err).NotTo(HaveOccurred())

			// Now member should be allowed
			allowed, err = enf.Enforce(ctx, "h1", Project, Join)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())

			// Cleanup
			enf.RemovePolicy(&memberRole, "h1", Project, Join)
		})

		It("submission create capability uses team domain", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			// Map user to member role with team wildcard
			_, err := enf.AddRole("member-user", Member, "h1", WithTeam("team-1"))
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("member-user", Member, "h1", WithTeam("team-1"))
			})

			// Member without submission capability should be denied
			ctx := CtxWithClaims("member-user")
			allowed, err := enf.Enforce(ctx, "h1", Submission, Create, WithTeam("team-1"))
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeFalse())

			// Add submission capability with team wildcard
			memberRole := Member
			err = enf.AddPolicy(&memberRole, "h1", Submission, Create, WithTeam("*"))
			Expect(err).NotTo(HaveOccurred())

			// Now member should be allowed for any team
			allowed, err = enf.Enforce(ctx, "h1", Submission, Create, WithTeam("team-1"))
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())

			// Cleanup
			enf.RemovePolicy(&memberRole, "h1", Submission, Create, WithTeam("*"))
		})

		It("vote create capability gates voting", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			// Map user to member role
			_, err := enf.AddRole("member-user", Member, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("member-user", Member, "h1")
			})

			// Member without vote capability should be denied
			ctx := CtxWithClaims("member-user")
			allowed, err := enf.Enforce(ctx, "h1", Vote, Create)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeFalse())

			// Add vote capability for member
			memberRole := Member
			err = enf.AddPolicy(&memberRole, "h1", Vote, Create)
			Expect(err).NotTo(HaveOccurred())

			// Now member should be allowed
			allowed, err = enf.Enforce(ctx, "h1", Vote, Create)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())

			// Cleanup
			enf.RemovePolicy(&memberRole, "h1", Vote, Create)
		})

		It("vote result read capability gates viewing results", func() {
			enf := testutils.NewMockEnforcer("admin-uuid")

			// Map user to member role
			_, err := enf.AddRole("member-user", Member, "h1")
			Expect(err).NotTo(HaveOccurred())
			DeferCleanup(func() {
				_, _ = enf.RemoveRole("member-user", Member, "h1")
			})

			// Member without vote result capability should be denied
			ctx := CtxWithClaims("member-user")
			allowed, err := enf.Enforce(ctx, "h1", VoteResult, Read)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeFalse())

			// Add vote result capability for member
			memberRole := Member
			err = enf.AddPolicy(&memberRole, "h1", VoteResult, Read)
			Expect(err).NotTo(HaveOccurred())

			// Now member should be allowed
			allowed, err = enf.Enforce(ctx, "h1", VoteResult, Read)
			Expect(err).NotTo(HaveOccurred())
			Expect(allowed).To(BeTrue())

			// Cleanup
			enf.RemovePolicy(&memberRole, "h1", VoteResult, Read)
		})
	})

	Describe("Permission.String()", func() {
		DescribeTable("returns correct string values",
			func(p Permission, expected string) {
				Expect(p.String()).To(Equal(expected))
			},
			Entry("Read", Read, "read"),
			Entry("Write", Write, "write"),
			Entry("Create", Create, "create"),
			Entry("Propose", Propose, "propose"),
			Entry("Join", Join, "join"),
		)
	})

	Describe("ObjectType.String()", func() {
		DescribeTable("returns correct string values",
			func(ot ObjectType, expected string) {
				Expect(ot.String()).To(Equal(expected))
			},
			Entry("Hackathon", Hackathon, "hackathon"),
			Entry("Page", Page, "page"),
			Entry("Phase", Phase, "phase"),
			Entry("Track", Track, "track"),
			Entry("Project", Project, "project"),
			Entry("Team", Team, "team"),
			Entry("Submission", Submission, "submission"),
			Entry("Vote", Vote, "vote"),
			Entry("VoteResult", VoteResult, "vote_result"),
			Entry("User", User, "user"),
		)
	})

})
