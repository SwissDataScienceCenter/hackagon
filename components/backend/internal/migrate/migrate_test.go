//go:build test && unittest

package migrate_test

import (
	"context"
	"testing"

	. "github.com/onsi/ginkgo/v2" //nolint:staticcheck // dot import in test file is fine
	. "github.com/onsi/gomega"    //nolint:staticcheck // dot import in test file is fine
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/migrate"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

func TestMigrate(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "Migrate Suite")
}

// publicHackathon inserts a public hackathon and returns its id. The creator
// edge is required, so it gets an owner nobody else uses.
func publicHackathon(ctx context.Context, dbClient *ent.Client, name string) string {
	GinkgoHelper()

	creator, err := dbClient.User.Create().
		SetKeycloakID("migrate-creator-" + name).
		SetUsername("migrate-creator-" + name).
		Save(ctx)
	Expect(err).NotTo(HaveOccurred())

	h, err := dbClient.Hackathon.Create().
		SetName(name).
		SetVisibility(enthackathon.VisibilityPublic).
		SetCreator(creator).
		SetModifier(creator).
		Save(ctx)
	Expect(err).NotTo(HaveOccurred())

	return h.ID.String()
}

var _ = Describe("Run", func() {
	It("drops the wildcard read row an older build left behind", func() {
		ctx := context.Background()
		dbClient, _, enf := testutils.CreateTestServer()

		id := publicHackathon(ctx, dbClient, "made public by an older build")

		// What the old AllowPublicHackathonAccess wrote: a nil role is the `*`
		// subject, so this is the legacy row exactly.
		Expect(enf.AddPolicy(nil, id, mw.Hackathon, mw.Read)).To(Succeed())

		leaked, err := enf.CheckPermission("a-stranger", id, mw.Hackathon, mw.Read)
		Expect(err).NotTo(HaveOccurred())
		Expect(leaked).To(BeTrue(), "precondition: the leak is present")

		Expect(migrate.Run(ctx, dbClient, enf)).To(Succeed())

		leaked, err = enf.CheckPermission("a-stranger", id, mw.Hackathon, mw.Read)
		Expect(err).NotTo(HaveOccurred())
		Expect(leaked).To(BeFalse(), "a stranger can no longer read the hackathon")
	})

	It("is safe to run on a database that never had the row", func() {
		ctx := context.Background()
		dbClient, _, enf := testutils.CreateTestServer()

		id := publicHackathon(ctx, dbClient, "made public by this build")

		_, err := enf.AllowPublicHackathonAccess(id)
		Expect(err).NotTo(HaveOccurred())

		Expect(migrate.Run(ctx, dbClient, enf)).To(Succeed())

		// The view grant is untouched -- the migration only knows about read.
		canView, err := enf.CheckPermission("a-stranger", id, mw.Hackathon, mw.View)
		Expect(err).NotTo(HaveOccurred())
		Expect(canView).To(BeTrue())
	})
})
