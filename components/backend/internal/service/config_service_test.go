//go:build test && unittest

package service_test

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathonwindows "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonwindows"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	cfgMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/config_svc"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

// Window enforcement — requireWindowOpen in config_service.go, seen through the
// RPC that consults it.
//
// Driven through Join rather than by calling the unexported function, because
// the property is "the acting RPC refuses", and the two halves of a window plus
// its override are the same closure for every kind: registration exercises
// `closedAfter` (shared with proposals, preferences and submissions) and the
// opens-before branch that only registration has.
//
// NO CLOCK CONTROL AND NO SLEEP. Every instant here is written relative to
// time.Now() at the moment the window is stored — a deadline an hour in the past
// is closed however slowly the suite runs, and an override thirty minutes out
// cannot expire mid-spec. A test that sleeps to cross a boundary is a test that
// flakes on a loaded machine.
var _ = Describe("Window enforcement", func() {
	var (
		dbClient    *ent.Client
		conn        *grpc.ClientConn
		hackClient  hackathonSvc.HackathonServiceClient
		cfgClient   hackathonSvc.ConfigServiceClient
		adminCtx    context.Context
		joinerCtx   context.Context
		joiner      *ent.User
		hackathonID string
	)

	authed := func(keycloakID string) context.Context {
		return metadata.NewOutgoingContext(
			context.Background(),
			metadata.Pairs(
				"authorization",
				"Bearer "+testutils.CreateTestJWTToken(keycloakID),
			),
		)
	}

	BeforeEach(func() {
		dbClient, conn, _ = testutils.CreateTestServer()
		hackClient = hackathonSvc.NewHackathonServiceClient(conn)
		cfgClient = hackathonSvc.NewConfigServiceClient(conn)
		adminCtx = authed(testutils.TestAdminKeycloakID)

		now := time.Now()
		created, err := hackClient.Create(adminCtx, &msgs.CreateRequest{
			Name:       "Windowed Hackathon",
			Visibility: entities.Visibility_VISIBILITY_PUBLIC,
			StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
			EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
		})
		Expect(err).NotTo(HaveOccurred())
		hackathonID = created.GetHackathonId()

		joiner, err = dbClient.User.Create().
			SetKeycloakID("window-joiner").
			SetUsername("window-joiner").
			Save(context.Background())
		Expect(err).NotTo(HaveOccurred())
		joinerCtx = authed("window-joiner")
	})

	join := func() error {
		_, err := hackClient.Join(joinerCtx, &msgs.JoinRequest{HackathonId: hackathonID})

		return err
	}

	// onRoster reads the END STATE back. "The call was refused" and "no row was
	// written" are different claims, and the second is the one a participant
	// would notice.
	onRoster := func() int {
		n, err := dbClient.Participant.Query().Where(
			entparticipant.HackathonIDEQ(uuid.MustParse(hackathonID)),
			entparticipant.UserIDEQ(joiner.ID),
		).Count(context.Background())
		Expect(err).NotTo(HaveOccurred())

		return n
	}

	setWindows := func(req *cfgMsgs.SetWindowsRequest) {
		GinkgoHelper()
		req.HackathonId = hackathonID
		_, err := cfgClient.SetWindows(adminCtx, req)
		Expect(err).NotTo(HaveOccurred())
	}

	// The control. Every refusal below is only evidence about the WINDOW if the
	// same join lands when no window is configured — otherwise the whole
	// Describe would agree just as loudly with a Join that refused everybody.
	It("lets a join through when no window is configured", func() {
		Expect(join()).To(Succeed())
		Expect(onRoster()).To(Equal(1))
	})

	It("refuses a join once the registration window has closed", func() {
		setWindows(&cfgMsgs.SetWindowsRequest{
			RegistrationCloses: timestamppb.New(time.Now().Add(-1 * time.Hour)),
		})

		err := join()
		Expect(err).To(HaveOccurred())
		Expect(status.Convert(err).Code()).To(Equal(codes.FailedPrecondition))
		Expect(status.Convert(err).Message()).To(ContainSubstring("registration is closed"))
		Expect(onRoster()).To(Equal(0), "a refused join must write no participant row")
	})

	It("refuses a join before the registration window opens", func() {
		setWindows(&cfgMsgs.SetWindowsRequest{
			RegistrationOpens: timestamppb.New(time.Now().Add(1 * time.Hour)),
		})

		err := join()
		Expect(err).To(HaveOccurred())
		Expect(status.Convert(err).Code()).To(Equal(codes.FailedPrecondition))
		Expect(status.Convert(err).Message()).To(ContainSubstring("not open yet"))
		Expect(onRoster()).To(Equal(0), "a refused join must write no participant row")
	})

	It("reopens a closed window for the length of a now-anchored override", func() {
		setWindows(&cfgMsgs.SetWindowsRequest{
			RegistrationCloses: timestamppb.New(time.Now().Add(-1 * time.Hour)),
		})

		// Anchored at NOW, not at the configured close — which is what makes a
		// late signup a support decision ("let them in for the next 30 minutes")
		// rather than an argument about how long ago the deadline was.
		_, err := cfgClient.OverrideWindow(adminCtx, &cfgMsgs.OverrideWindowRequest{
			HackathonId:   hackathonID,
			Window:        "registration",
			ExtendMinutes: 30,
			Reason:        "walk-in at the desk",
		})
		Expect(err).NotTo(HaveOccurred())

		Expect(join()).To(Succeed())
		Expect(onRoster()).To(Equal(1))
	})

	It("stops honouring an override once it has expired", func() {
		setWindows(&cfgMsgs.SetWindowsRequest{
			RegistrationCloses: timestamppb.New(time.Now().Add(-1 * time.Hour)),
		})

		// An override that has RUN OUT, written straight to the row. The RPC
		// cannot produce this state — protovalidate holds extend_minutes to
		// 1..1440, so an override is always granted into the future — and the
		// only other way to reach it is to wait for one to expire, which is a
		// sleep, and a test that sleeps to cross a boundary flakes. This is what
		// the row of a 30-minute grace window looks like an hour later.
		_, err := dbClient.HackathonWindows.Update().
			Where(enthackathonwindows.HasHackathonWith(
				enthackathon.IDEQ(uuid.MustParse(hackathonID)),
			)).
			SetRegistrationOverrideUntil(time.Now().Add(-30 * time.Minute)).
			Save(context.Background())
		Expect(err).NotTo(HaveOccurred())

		err = join()
		Expect(err).To(HaveOccurred())
		Expect(status.Convert(err).Code()).To(Equal(codes.FailedPrecondition))
		Expect(onRoster()).To(Equal(0))
	})
})
