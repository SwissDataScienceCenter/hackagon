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

	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	projectMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/project_svc"
	teamMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/team_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

// D5: a waitlisted registrant holds the Member role (granted at Join so they can
// propose) and Member carries hackathon-wide Submission:Read — so without the
// gate an unapproved registrant could read every team's work. The gate excludes
// callers who hold a waitlisted participant row; approval lifts it.
var _ = Describe("Submission read waitlist gate (D5)", func() {
	ctxFor := func(kc string) context.Context {
		return metadata.NewOutgoingContext(
			context.Background(),
			metadata.Pairs("authorization", "Bearer "+testutils.CreateTestJWTToken(kc)),
		)
	}

	It("D5 refuses a waitlisted registrant, and approval lets them past", func() {
		dbClient, conn, _ := testutils.CreateTestServer()
		hackathonClient := hackathonSvc.NewHackathonServiceClient(conn)
		projectClient := hackathonSvc.NewProjectServiceClient(conn)
		teamClient := hackathonSvc.NewTeamServiceClient(conn)

		adminCtx := ctxFor(testutils.TestAdminKeycloakID)
		now := time.Now()
		h, err := hackathonClient.Create(adminCtx, &msgs.CreateRequest{
			Name:        "Sub Read Gate",
			Description: testutils.StringPtr("d"),
			Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
			StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
			EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
		})
		Expect(err).NotTo(HaveOccurred())
		hackathonID := h.GetHackathonId()
		_, err = hackathonClient.EditSettings(adminCtx, &msgs.EditSettingsRequest{
			HackathonId:          hackathonID,
			RegistrationsEnabled: testutils.BoolPtr(true),
		})
		Expect(err).NotTo(HaveOccurred())

		// A team with a project. No submission is needed: the read gate runs
		// before the submission query, so the code it returns is what is under
		// test (PermissionDenied from the gate vs NotFound past it).
		p, err := projectClient.Propose(adminCtx, &projectMsgs.ProposeRequest{
			HackathonId: hackathonID,
			Title:       "Gate Project",
			Description: "desc",
		})
		Expect(err).NotTo(HaveOccurred())
		t, err := teamClient.Create(adminCtx, &teamMsgs.CreateRequest{
			Name:      "Gate Team",
			ProjectId: p.GetProjectId(),
		})
		Expect(err).NotTo(HaveOccurred())
		teamID := t.GetTeamId()

		// An outsider who joins (waitlisted) and is not on the team.
		outsider := "d5-outsider"
		_, err = dbClient.User.Create().
			SetKeycloakID(outsider).SetUsername(outsider).Save(context.Background())
		Expect(err).NotTo(HaveOccurred())
		outsiderCtx := ctxFor(outsider)
		_, err = hackathonClient.Join(outsiderCtx, &msgs.JoinRequest{HackathonId: hackathonID})
		Expect(err).NotTo(HaveOccurred())

		// Waitlisted → refused by the gate.
		_, err = teamClient.GetSubmission(outsiderCtx,
			&teamMsgs.GetSubmissionRequest{TeamId: teamID})
		Expect(status.Code(err)).To(Equal(codes.PermissionDenied))

		// Approve → confirmed participant → past the gate; there is no submission,
		// so NotFound. A different code is the proof the gate opened on approval.
		outsiderUser, err := dbClient.User.Query().
			Where(entuser.KeycloakIDEQ(outsider)).Only(context.Background())
		Expect(err).NotTo(HaveOccurred())
		_, err = hackathonClient.ApproveParticipant(adminCtx, &msgs.ApproveParticipantRequest{
			HackathonId: hackathonID,
			UserId:      outsiderUser.ID.String(),
		})
		Expect(err).NotTo(HaveOccurred())

		_, err = teamClient.GetSubmission(outsiderCtx,
			&teamMsgs.GetSubmissionRequest{TeamId: teamID})
		Expect(status.Code(err)).To(Equal(codes.NotFound))
	})
})
