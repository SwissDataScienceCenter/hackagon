//go:build test && unittest

package service_test

import (
	"context"
	"strings"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entproject "github.com/swissdatasciencecenter/hackagon/components/backend/ent/project"
	entsubmission "github.com/swissdatasciencecenter/hackagon/components/backend/ent/submission"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackathonMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	publicMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/public_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("PublicService", func() {
	var (
		dbClient  *ent.Client
		conn      *grpc.ClientConn
		client    hackathonSvc.PublicServiceClient
		publicID  string
		privateID string
	)

	// Every call in this file goes out with no authorization metadata. That is
	// the point of the service, so the anonymous context is the default here
	// rather than a special case some tests opt into.
	anon := func() context.Context { return context.Background() }

	BeforeEach(func() {
		dbClient, conn, _ = testutils.CreateTestServer()
		client = hackathonSvc.NewPublicServiceClient(conn)

		adminCtx := metadata.NewOutgoingContext(
			context.Background(),
			metadata.Pairs(
				"authorization",
				"Bearer "+testutils.CreateTestJWTToken(testutils.TestAdminKeycloakID),
			),
		)
		hClient := hackathonSvc.NewHackathonServiceClient(conn)

		pub, err := hClient.Create(adminCtx, &hackathonMsgs.CreateRequest{
			Name:       "Open Hackathon",
			Visibility: entities.Visibility_VISIBILITY_PUBLIC,
		})
		Expect(err).NotTo(HaveOccurred())
		publicID = pub.GetHackathonId()

		priv, err := hClient.Create(adminCtx, &hackathonMsgs.CreateRequest{
			Name:       "Closed Hackathon",
			Visibility: entities.Visibility_VISIBILITY_PRIVATE,
		})
		Expect(err).NotTo(HaveOccurred())
		privateID = priv.GetHackathonId()

		ctx := context.Background()
		admin, err := dbClient.User.Query().
			Where(entuser.KeycloakIDEQ(testutils.TestAdminKeycloakID)).
			Only(ctx)
		Expect(err).NotTo(HaveOccurred())
		hackUUID := uuid.MustParse(publicID)

		// Two people with real-looking addresses, so the "no address ever leaves
		// here" assertion below has something to catch.
		member1, err := dbClient.User.Create().
			SetUsername("team-member-one").SetKeycloakID("kc-member-one").
			SetEmail("member.one@people.invalid").SetDisplayName("Member One").Save(ctx)
		Expect(err).NotTo(HaveOccurred())
		member2, err := dbClient.User.Create().
			SetUsername("team-member-two").SetKeycloakID("kc-member-two").
			SetEmail("member.two@people.invalid").SetDisplayName("Member Two").Save(ctx)
		Expect(err).NotTo(HaveOccurred())

		_, err = dbClient.Page.Create().
			SetHackathonID(hackUUID).SetTitle("Schedule").SetContent("## Day one").
			SetVisible(true).SetOrder(0).SetCreator(admin).SetModifier(admin).Save(ctx)
		Expect(err).NotTo(HaveOccurred())
		_, err = dbClient.Page.Create().
			SetHackathonID(hackUUID).SetTitle("Organiser notes").SetContent("secret").
			SetVisible(false).SetOrder(1).SetCreator(admin).SetModifier(admin).Save(ctx)
		Expect(err).NotTo(HaveOccurred())

		approved, err := dbClient.Project.Create().
			SetHackathonID(hackUUID).SetTitle("Approved Project").
			SetDescription("a real one").SetStatus(entproject.StatusApproved).
			SetCreator(admin).SetModifier(admin).Save(ctx)
		Expect(err).NotTo(HaveOccurred())
		_, err = dbClient.Project.Create().
			SetHackathonID(hackUUID).SetTitle("Merely Proposed").
			SetDescription("not accepted yet").SetStatus(entproject.StatusProposed).
			SetCreator(admin).SetModifier(admin).Save(ctx)
		Expect(err).NotTo(HaveOccurred())

		team, err := dbClient.Team.Create().
			SetProject(approved).SetName("Team Alpha").SetCreator(admin).
			AddMembers(member1, member2).Save(ctx)
		Expect(err).NotTo(HaveOccurred())

		_, err = dbClient.Submission.Create().
			SetTeam(team).SetProject(approved).SetCreator(admin).
			SetStatus(entsubmission.StatusFinal).SetVersion(1).
			SetResult("https://files.test/final-writeup").Save(ctx)
		Expect(err).NotTo(HaveOccurred())
		_, err = dbClient.Submission.Create().
			SetTeam(team).SetProject(approved).SetCreator(admin).
			SetStatus(entsubmission.StatusDraft).SetVersion(2).
			SetResult("half finished, please do not read").Save(ctx)
		Expect(err).NotTo(HaveOccurred())
	})

	Describe("ListHackathons", func() {
		It("serves the public directory to an anonymous caller", func() {
			resp, err := client.ListHackathons(anon(), &publicMsgs.ListHackathonsRequest{})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetHackathons()).To(HaveLen(1))
			Expect(resp.GetHackathons()[0].GetName()).To(Equal("Open Hackathon"))
		})
	})

	Describe("GetHackathon", func() {
		It("serves a public hackathon to an anonymous caller", func() {
			resp, err := client.GetHackathon(anon(),
				&publicMsgs.GetHackathonRequest{HackathonId: publicID})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetHackathon().GetId()).To(Equal(publicID))
			Expect(resp.GetHackathon().GetName()).To(Equal("Open Hackathon"))
		})

		// NotFound rather than PermissionDenied: whether a private hackathon
		// exists is not a visitor's business either.
		It("reports a private hackathon as not found", func() {
			_, err := client.GetHackathon(anon(),
				&publicMsgs.GetHackathonRequest{HackathonId: privateID})
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
		})

		It("reports an unknown id as not found", func() {
			_, err := client.GetHackathon(anon(),
				&publicMsgs.GetHackathonRequest{HackathonId: uuid.NewString()})
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
		})

		It("publishes visible pages and withholds hidden ones", func() {
			resp, err := client.GetHackathon(anon(),
				&publicMsgs.GetHackathonRequest{HackathonId: publicID})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetHackathon().GetPages()).To(HaveLen(1))
			Expect(resp.GetHackathon().GetPages()[0].GetTitle()).To(Equal("Schedule"))
		})

		It("publishes approved projects and withholds proposals", func() {
			resp, err := client.GetHackathon(anon(),
				&publicMsgs.GetHackathonRequest{HackathonId: publicID})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetHackathon().GetProjects()).To(HaveLen(1))
			Expect(resp.GetHackathon().GetProjects()[0].GetTitle()).To(Equal("Approved Project"))
		})

		It("publishes a team as a count of people, not a list of them", func() {
			resp, err := client.GetHackathon(anon(),
				&publicMsgs.GetHackathonRequest{HackathonId: publicID})
			Expect(err).NotTo(HaveOccurred())

			teams := resp.GetHackathon().GetTeams()
			Expect(teams).To(HaveLen(1))
			Expect(teams[0].GetName()).To(Equal("Team Alpha"))
			Expect(teams[0].GetMemberCount()).To(Equal(int32(2)))
		})

		It("publishes final submissions and withholds drafts", func() {
			resp, err := client.GetHackathon(anon(),
				&publicMsgs.GetHackathonRequest{HackathonId: publicID})
			Expect(err).NotTo(HaveOccurred())

			subs := resp.GetHackathon().GetTeams()[0].GetSubmissions()
			Expect(subs).To(HaveLen(1))
			Expect(subs[0].GetResult()).To(Equal("https://files.test/final-writeup"))
		})

		// The invariant the whole Public* message family exists to hold. It is
		// asserted on the serialized response rather than field by field, because
		// the thing worth catching is a field nobody thought to check.
		// Two members with real addresses are seeded above; if either ever
		// reaches a visitor, this fails.
		It("never lets an email address reach an anonymous caller", func() {
			resp, err := client.GetHackathon(anon(),
				&publicMsgs.GetHackathonRequest{HackathonId: publicID})
			Expect(err).NotTo(HaveOccurred())

			wire, err := protojson.Marshal(resp)
			Expect(err).NotTo(HaveOccurred())
			Expect(strings.Contains(string(wire), "@")).To(BeFalse(),
				"the public response carried an address-shaped string: %s", string(wire))
			// The seeded addresses live on a domain of their own, so this cannot
			// be tripped by an ordinary URL a submission is entitled to carry.
			Expect(strings.Contains(string(wire), "people.invalid")).To(BeFalse())
			Expect(strings.ToLower(string(wire))).NotTo(ContainSubstring("keycloak"))
		})
	})
})
