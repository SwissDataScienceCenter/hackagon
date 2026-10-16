//go:build test && unittest

package migrate_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	. "github.com/onsi/ginkgo/v2" //nolint:staticcheck // dot import in test file is fine
	. "github.com/onsi/gomega"    //nolint:staticcheck // dot import in test file is fine
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entanswer "github.com/swissdatasciencecenter/hackagon/components/backend/ent/answer"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entquestion "github.com/swissdatasciencecenter/hackagon/components/backend/ent/question"
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
	It("moves a hackathon published by an older build onto view", func() {
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

		// The other half: it is still public, so signing up still works.
		canView, err := enf.CheckPermission("a-stranger", id, mw.Hackathon, mw.View)
		Expect(err).NotTo(HaveOccurred())
		Expect(canView).To(BeTrue(), "a stranger can still view the hackathon")
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

var _ = Describe("answers of people no longer in the hackathon", func() {
	It("deletes them and keeps every participant's answers", func() {
		ctx := context.Background()
		dbClient, _, enf := testutils.CreateTestServer()

		newUser := func(name string) uuid.UUID {
			u, err := dbClient.User.Create().SetKeycloakID(name).SetUsername(name).Save(ctx)
			Expect(err).NotTo(HaveOccurred())
			return u.ID
		}
		addParticipant := func(hackathonID string, userID uuid.UUID, waiting bool) {
			_, err := dbClient.Participant.Create().
				SetHackathonID(uuid.MustParse(hackathonID)).
				SetUserID(userID).
				SetIsWaiting(waiting).
				Save(ctx)
			Expect(err).NotTo(HaveOccurred())
		}
		author := newUser("question-author")
		addQuestion := func(hackathonID string) uuid.UUID {
			q, err := dbClient.Question.Create().
				SetHackathonID(uuid.MustParse(hackathonID)).
				SetKey("company").
				SetLabel("Company").
				SetDataType(entquestion.DataTypeText).
				SetOptions([]string{}).
				SetCreatorID(author).
				SetModifierID(author).
				Save(ctx)
			Expect(err).NotTo(HaveOccurred())
			return q.ID
		}
		addAnswer := func(questionID uuid.UUID, userID uuid.UUID) {
			_, err := dbClient.Answer.Create().
				SetQuestionID(questionID).
				SetUserID(userID).
				SetValue("SDSC").
				Save(ctx)
			Expect(err).NotTo(HaveOccurred())
		}
		hasAnswer := func(questionID uuid.UUID, userID uuid.UUID) bool {
			ok, err := dbClient.Answer.Query().Where(
				entanswer.QuestionIDEQ(questionID),
				entanswer.UserIDEQ(userID),
			).Exist(ctx)
			Expect(err).NotTo(HaveOccurred())
			return ok
		}

		hackathon1 := publicHackathon(ctx, dbClient, "with participants")
		hackathon2 := publicHackathon(ctx, dbClient, "where the removed one stays")
		hackathonEmpty := publicHackathon(ctx, dbClient, "with nobody left")
		q1, q2, qEmpty := addQuestion(
			hackathon1,
		), addQuestion(
			hackathon2,
		), addQuestion(
			hackathonEmpty,
		)

		confirmed, waiting, removed := newUser("confirmed"), newUser("waiting"), newUser("removed")
		addParticipant(hackathon1, confirmed, false)
		addParticipant(hackathon1, waiting, true)
		addParticipant(hackathon2, removed, false)

		addAnswer(q1, confirmed)
		addAnswer(q1, waiting)
		addAnswer(q1, removed) // what an older RemoveParticipant left behind
		addAnswer(q2, removed)
		addAnswer(qEmpty, confirmed)

		Expect(migrate.Run(ctx, dbClient, enf)).To(Succeed())

		Expect(hasAnswer(q1, removed)).To(BeFalse(), "removed from this hackathon")
		Expect(hasAnswer(qEmpty, confirmed)).To(BeFalse(), "hackathon with no participants")
		Expect(hasAnswer(q1, confirmed)).To(BeTrue(), "confirmed participant")
		Expect(hasAnswer(q1, waiting)).To(BeTrue(), "waitlisted participant")
		Expect(hasAnswer(q2, removed)).To(BeTrue(), "same user, still in the other hackathon")
	})
})
