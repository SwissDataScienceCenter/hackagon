//go:build test && integration

package smoke_test

import (
	"fmt"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	healthgrpc "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/status"

	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	userSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user"
	userEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	userMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/messages/user_svc"
)

// The seeded fixture this suite leans on. Kept to the three hackathon names and
// the two people with Keycloak accounts, because every further detail is one
// more way for a seed change to redden a build that is meant to be about the
// deployment rather than about the fixture.
const (
	sentinelHackathon = "AI Innovation Challenge 2026"
	climateHackathon  = "Climate Tech Hackathon 2026"
	sprintHackathon   = "Internal Product Sprint"

	// alice organizes the sentinel hackathon; bob merely takes part in it.
	organizer   = "alice"
	participant = "bob"
)

var _ = Describe("A running Hackagon stack", Ordered, func() {
	var (
		health     healthgrpc.HealthClient
		users      userSvc.UserServiceClient
		hackathons hackathonSvc.HackathonServiceClient
	)

	BeforeAll(func() {
		conn, err := grpc.NewClient(
			backendAddr,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		Expect(err).NotTo(HaveOccurred())
		DeferCleanup(func() { _ = conn.Close() })

		health = healthgrpc.NewHealthClient(conn)
		users = userSvc.NewUserServiceClient(conn)
		hackathons = hackathonSvc.NewHackathonServiceClient(conn)
	})

	It("serves gRPC on its port", func(ctx SpecContext) {
		resp, err := health.Check(ctx, &healthgrpc.HealthCheckRequest{})
		Expect(err).NotTo(HaveOccurred(),
			"no gRPC health response from %s — is the stack up? (just deploy::up)", backendAddr)
		Expect(resp.GetStatus()).To(Equal(healthgrpc.HealthCheckResponse_SERVING))
	}, SpecTimeout(specTimeout))

	// The end-to-end auth assertion, and the reason this suite exists at all.
	// A token minted by Keycloak has to survive the backend fetching JWKS,
	// checking the issuer and resolving `sub` against a row seeded by a
	// completely separate process. The role is what proves that last step: a
	// user conjured from token claims alone would come back with none.
	It("accepts a token Keycloak issued, for the user the seed created", func(ctx SpecContext) {
		resp, err := users.WhoAmI(as(ctx, organizer), &userMsgs.WhoAmIRequest{})
		Expect(err).NotTo(HaveOccurred(),
			"the backend rejected a genuine Keycloak token for %q", organizer)

		Expect(resp.GetUser().GetUsername()).To(Equal(organizer))
		Expect(resp.GetUser().GetRoles()).To(
			ContainElement(userEnts.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER),
			"%q resolved to a user without the seeded organizer role, "+
				"so the token's subject did not match the seeded row", organizer)
	}, SpecTimeout(specTimeout))

	It("reads the seeded fixture back out of Postgres", func(ctx SpecContext) {
		resp, err := hackathons.List(as(ctx, organizer), &hackMsgs.ListRequest{})
		Expect(err).NotTo(HaveOccurred())

		names := []string{}
		for _, h := range resp.GetHackathons() {
			names = append(names, h.GetName())
		}

		Expect(names).To(ContainElements(
			sentinelHackathon, climateHackathon, sprintHackathon,
		), "seeded hackathons missing — did `just db::seed` run against this database?")
	}, SpecTimeout(specTimeout))

	// The write path on the real driver. Everything under `internal/**` writes
	// to SQLite, so a column, default or constraint that only the Postgres
	// migration produces has nowhere else to go wrong in front of us.
	//
	// The row is left behind: no RPC deletes a hackathon. CI throws its database
	// away, and the name says plainly what it is on a machine that does not.
	It("writes to Postgres and reads the row back", func(ctx SpecContext) {
		name := fmt.Sprintf("smoke test %s", time.Now().UTC().Format(time.RFC3339))

		created, err := hackathons.Create(as(ctx, organizer), &hackMsgs.CreateRequest{
			Name:       name,
			Visibility: hackEnts.Visibility_VISIBILITY_PRIVATE,
		})
		Expect(err).NotTo(HaveOccurred())
		Expect(created.GetHackathonId()).NotTo(BeEmpty())

		got, err := hackathons.Get(as(ctx, organizer), &hackMsgs.GetRequest{
			HackathonId: created.GetHackathonId(),
		})
		Expect(err).NotTo(HaveOccurred(), "the hackathon just created could not be read back")
		Expect(got.GetHackathon().GetName()).To(Equal(name))
	}, SpecTimeout(specTimeout))

	// Both refusals below assert the *code*, not merely that the call failed.
	// PERMISSION_DENIED means the system refused on purpose and the frontend
	// renders a clean 403; INTERNAL means something fell over on the way to
	// refusing and the user gets a 500. Only one of those is correct, and a test
	// that accepts any error cannot tell them apart.
	It("refuses an admin-only call from an ordinary participant", func(ctx SpecContext) {
		_, err := users.AddRole(as(ctx, participant), &userMsgs.AddRoleRequest{
			UserId: "00000000-0000-0000-0000-000000000000",
			Role:   userEnts.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER,
		})

		Expect(status.Code(err)).To(Equal(codes.PermissionDenied),
			"granting a global role as %q should be refused, not fail some other way", participant)
	}, SpecTimeout(specTimeout))

	It("refuses to let a participant edit the hackathon they joined", func(ctx SpecContext) {
		listed, err := hackathons.List(as(ctx, participant), &hackMsgs.ListRequest{})
		Expect(err).NotTo(HaveOccurred())

		var id string
		for _, h := range listed.GetHackathons() {
			if h.GetName() == sentinelHackathon {
				id = h.GetId()

				break
			}
		}
		Expect(id).NotTo(BeEmpty(), "%q not visible to %q", sentinelHackathon, participant)

		newName := "renamed by a participant"
		_, err = hackathons.Edit(as(ctx, participant), &hackMsgs.EditRequest{
			HackathonId: id,
			Name:        &newName,
		})

		Expect(status.Code(err)).To(Equal(codes.PermissionDenied),
			"%q is a participant in %q, not an owner of it", participant, sentinelHackathon)
	}, SpecTimeout(specTimeout))
})
