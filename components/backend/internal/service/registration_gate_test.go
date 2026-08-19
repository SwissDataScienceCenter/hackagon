//go:build test && unittest

package service_test

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

// D3: SubmitRegistrationForm's self path (on_behalf_of unset) had no gate, so
// any authenticated user could file a response into any hackathon — a private
// one included — and read its form schema off the validation errors. The gate
// requires a Participant row, which Join writes (and a private event's Join
// needs an invite). Waitlisted participants must still pass.
var _ = Describe("SubmitRegistrationForm self-path gate (D3)", func() {
	adminCtxFor := func(kc string) context.Context {
		return metadata.NewOutgoingContext(
			context.Background(),
			metadata.Pairs("authorization", "Bearer "+testutils.CreateTestJWTToken(kc)),
		)
	}

	It("D3 refuses a non-participant on the self path", func() {
		dbClient, conn, _ := testutils.CreateTestServer()
		hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)

		adminCtx := adminCtxFor(testutils.TestAdminKeycloakID)
		now := time.Now()
		h, err := hackathonClient.Create(adminCtx, &msgs.CreateRequest{
			Name:        "Reg Gate",
			Description: testutils.StringPtr("d"),
			Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
			StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
			EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
		})
		Expect(err).NotTo(HaveOccurred())

		// A user who never joined.
		outsider := "d3-outsider"
		_, err = dbClient.User.Create().
			SetKeycloakID(outsider).SetUsername(outsider).Save(context.Background())
		Expect(err).NotTo(HaveOccurred())

		_, err = hackathonClient.SubmitRegistrationForm(adminCtxFor(outsider),
			&msgs.SubmitRegistrationFormRequest{HackathonId: h.GetHackathonId()})
		Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
	})

	It("D3 lets a joined (waitlisted) participant past the gate", func() {
		dbClient, conn, _ := testutils.CreateTestServer()
		hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)

		adminCtx := adminCtxFor(testutils.TestAdminKeycloakID)
		now := time.Now()
		h, err := hackathonClient.Create(adminCtx, &msgs.CreateRequest{
			Name:        "Reg Gate 2",
			Description: testutils.StringPtr("d"),
			Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
			StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
			EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
		})
		Expect(err).NotTo(HaveOccurred())
		_, err = hackathonClient.EditSettings(adminCtx, &msgs.EditSettingsRequest{
			HackathonId:          h.GetHackathonId(),
			RegistrationsEnabled: testutils.BoolPtr(true),
		})
		Expect(err).NotTo(HaveOccurred())

		member := "d3-member"
		_, err = dbClient.User.Create().
			SetKeycloakID(member).SetUsername(member).Save(context.Background())
		Expect(err).NotTo(HaveOccurred())
		memberCtx := adminCtxFor(member)
		_, err = hackathonClient.Join(memberCtx, &msgs.JoinRequest{HackathonId: h.GetHackathonId()})
		Expect(err).NotTo(HaveOccurred())

		// Past the gate now: no form is defined, so the FORM check refuses it —
		// FailedPrecondition, not the gate's PermissionDenied. A different code
		// is the proof the participation gate let a waitlisted member through.
		_, err = hackathonClient.SubmitRegistrationForm(memberCtx,
			&msgs.SubmitRegistrationFormRequest{HackathonId: h.GetHackathonId()})
		Expect(status.Code(err)).To(Equal(codes.FailedPrecondition))
	})
})
