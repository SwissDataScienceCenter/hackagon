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
	entsubmission "github.com/swissdatasciencecenter/hackagon/components/backend/ent/submission"
	entteam "github.com/swissdatasciencecenter/hackagon/components/backend/ent/team"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	projectMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/project_svc"
	teamMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/team_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("TeamService", func() {

	var (
		dbClient        *ent.Client
		conn            *grpc.ClientConn
		teamClient      hackathonSvc.TeamServiceClient
		hackathonClient hackathonSvc.HackathonServiceClient
		projectClient   hackathonSvc.ProjectServiceClient
		testAdmin       string
	)

	BeforeEach(func() {
		dbClient, conn = testutils.CreateTestServer()
		testAdmin = testutils.TestAdminKeycloakID

		teamClient = hackathonSvc.NewTeamServiceClient(conn)
		hackathonClient = hackathonSvc.NewHackathonServiceClient(conn)
		projectClient = hackathonSvc.NewProjectServiceClient(conn)
	})

	Describe("Create", func() {
		It("creates a team successfully", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create hackathon and project first
			now := time.Now()
			hackathonResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Team Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			projectResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Title:       "Test Project",
				Description: "Test project description",
			})
			Expect(err).NotTo(HaveOccurred())

			req := &teamMsgs.CreateRequest{
				Name:        "Dream Team",
				Description: "The best team",
				ProjectId:   projectResp.GetProjectId(),
			}

			resp, err := teamClient.Create(ctx, req)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetTeamId()).NotTo(BeEmpty())

			teamID := resp.GetTeamId()

			// Verify in DB
			t, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(t.Name).To(Equal("Dream Team"))
			Expect(t.Edges.Members).To(HaveLen(1))
			Expect(t.Edges.Members[0].KeycloakID).To(Equal(testAdmin))
		})

		It("returns NOT_FOUND for invalid project ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			req := &teamMsgs.CreateRequest{
				Name:      "Fail Team",
				ProjectId: uuid.NewString(),
			}

			_, err := teamClient.Create(ctx, req)
			Expect(err).To(HaveOccurred())

			Describe("Get", func() {
				var teamID string
				var hackathonID string

				BeforeEach(func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					now := time.Now()
					hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
						Name:       "Get Test Hackathon",
						Visibility: ents.Visibility_VISIBILITY_PUBLIC,
						StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
						EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
					})
					Expect(err).NotTo(HaveOccurred())
					hackathonID = hResp.GetHackathonId()

					pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
						HackathonId: hackathonID,
						Title:       "Get Test Project",
						Description: "Desc",
					})
					Expect(err).NotTo(HaveOccurred())

					teamID = uuid.NewString()
					resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
						Name:      "Get Team",
						ProjectId: pResp.GetProjectId(),
					})
					Expect(err).NotTo(HaveOccurred())
					teamID = resp.GetTeamId()
				})

				It("retrieves team with full details", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					resp, err := teamClient.Get(ctx, &teamMsgs.GetRequest{TeamId: teamID})
					Expect(err).NotTo(HaveOccurred())
					Expect(resp.GetTeam().GetId()).To(Equal(teamID))
					Expect(resp.GetTeam().GetName()).To(Equal("Get Team"))
					Expect(resp.GetTeam()).NotTo(BeNil())
				})

				It("returns NOT_FOUND for invalid team ID", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					_, err := teamClient.Get(ctx, &teamMsgs.GetRequest{TeamId: uuid.NewString()})
					Expect(err).To(HaveOccurred())
					Expect(status.Code(err)).To(Equal(codes.NotFound))
				})
			})

			Describe("List", func() {
				var hackathonID string

				BeforeEach(func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					now := time.Now()
					hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
						Name:       "List Test Hackathon",
						Visibility: ents.Visibility_VISIBILITY_PUBLIC,
						StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
						EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
					})
					Expect(err).NotTo(HaveOccurred())
					hackathonID = hResp.GetHackathonId()

					pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
						HackathonId: hackathonID,
						Title:       "List Project",
						Description: "Desc",
					})
					Expect(err).NotTo(HaveOccurred())

					_, err = teamClient.Create(ctx, &teamMsgs.CreateRequest{
						Name:      "List Team 1",
						ProjectId: pResp.GetProjectId(),
					})
					Expect(err).NotTo(HaveOccurred())

					_, err = teamClient.Create(ctx, &teamMsgs.CreateRequest{
						Name:      "List Team 2",
						ProjectId: pResp.GetProjectId(),
					})
					Expect(err).NotTo(HaveOccurred())
				})

				It("lists all teams for a hackathon", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					resp, err := teamClient.List(
						ctx,
						&teamMsgs.ListRequest{HackathonId: testutils.StringPtr(hackathonID)},
					)
					Expect(err).NotTo(HaveOccurred())
					Expect(resp.GetTeams()).To(HaveLen(2))
				})

				It("returns INVALID_ARGUMENT for invalid hackathon ID", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					_, err := teamClient.List(
						ctx,
						&teamMsgs.ListRequest{HackathonId: testutils.StringPtr("not-a-uuid")},
					)
					Expect(err).To(HaveOccurred())
					Expect(status.Code(err)).To(Equal(codes.InvalidArgument))
				})
			})

			Describe("Edit", func() {
				var teamID string

				BeforeEach(func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					now := time.Now()
					hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
						Name:       "Edit Test Hackathon",
						Visibility: ents.Visibility_VISIBILITY_PUBLIC,
						StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
						EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
					})
					Expect(err).NotTo(HaveOccurred())

					pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
						HackathonId: hResp.GetHackathonId(),
						Title:       "Edit Project",
						Description: "Desc",
					})
					Expect(err).NotTo(HaveOccurred())

					teamID = uuid.NewString()
					resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
						Name:      "Original Name",
						ProjectId: pResp.GetProjectId(),
					})
					Expect(err).NotTo(HaveOccurred())
					teamID = resp.GetTeamId()
				})

				It("allows member to edit team", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					newName := "Updated Name"
					resp, err := teamClient.Edit(ctx, &teamMsgs.EditRequest{
						Id:   teamID,
						Name: &newName,
					})
					Expect(err).NotTo(HaveOccurred())
					Expect(resp.GetTeam().GetName()).To(Equal(newName))
				})

				It("denies edit for non-member", func() {
					nonMemberID := "non-member-team"
					_, err := dbClient.User.Create().
						SetKeycloakID(nonMemberID).
						SetUsername("non-member").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					token := testutils.CreateTestJWTToken(nonMemberID)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					newName := "Unauthorized Name"
					_, err = teamClient.Edit(ctx, &teamMsgs.EditRequest{
						Id:   teamID,
						Name: &newName,
					})
					Expect(err).To(HaveOccurred())
					Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
				})
			})

			Describe("Delete", func() {
				var teamID string

				BeforeEach(func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					now := time.Now()
					hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
						Name:       "Delete Test Hackathon",
						Visibility: ents.Visibility_VISIBILITY_PUBLIC,
						StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
						EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
					})
					Expect(err).NotTo(HaveOccurred())

					pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
						HackathonId: hResp.GetHackathonId(),
						Title:       "Delete Project",
						Description: "Desc",
					})
					Expect(err).NotTo(HaveOccurred())

					teamID = uuid.NewString()
					resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
						Name:      "Delete Team",
						ProjectId: pResp.GetProjectId(),
					})
					Expect(err).NotTo(HaveOccurred())
					teamID = resp.GetTeamId()
				})

				It("allows member to delete team", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					_, err := teamClient.Delete(ctx, &teamMsgs.DeleteRequest{Id: teamID})
					Expect(err).NotTo(HaveOccurred())

					_, err = dbClient.Team.Get(ctx, uuid.MustParse(teamID))
					Expect(err).To(HaveOccurred())
					Expect(ent.IsNotFound(err)).To(BeTrue())
				})

				It("denies delete for non-member", func() {
					nonMemberID := "non-member-delete"
					_, err := dbClient.User.Create().
						SetKeycloakID(nonMemberID).
						SetUsername("non-member-delete").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					token := testutils.CreateTestJWTToken(nonMemberID)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					_, err = teamClient.Delete(ctx, &teamMsgs.DeleteRequest{Id: teamID})
					Expect(err).To(HaveOccurred())
					Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
				})
			})

			Describe("AssignUser", func() {
				var teamID string
				var userID string

				BeforeEach(func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					now := time.Now()
					hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
						Name:       "Assign Test Hackathon",
						Visibility: ents.Visibility_VISIBILITY_PUBLIC,
						StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
						EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
					})
					Expect(err).NotTo(HaveOccurred())

					pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
						HackathonId: hResp.GetHackathonId(),
						Title:       "Assign Project",
						Description: "Desc",
					})
					Expect(err).NotTo(HaveOccurred())

					teamID = uuid.NewString()
					resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
						Name:      "Assign Team",
						ProjectId: pResp.GetProjectId(),
					})
					Expect(err).NotTo(HaveOccurred())
					teamID = resp.GetTeamId()

					u, err := dbClient.User.Create().
						SetKeycloakID("user-to-assign").
						SetUsername("user-to-assign-username").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())
					userID = u.ID.String()
				})

				It("allows member to assign user", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					_, err := teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
						TeamId: teamID,
						UserId: userID,
					})
					Expect(err).NotTo(HaveOccurred())
					t, err := dbClient.Team.Query().
						Where(entteam.IDEQ(uuid.MustParse(teamID))).
						WithMembers().
						Only(context.Background())
					Expect(err).NotTo(HaveOccurred())
					Expect(t.Edges.Members).To(HaveLen(2))
				})

				It("denies assignment for non-member", func() {
					nonMemberID := "non-member-assign"
					_, err := dbClient.User.Create().
						SetKeycloakID(nonMemberID).
						SetUsername("non-member-assign").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					token := testutils.CreateTestJWTToken(nonMemberID)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
						TeamId: teamID,
						UserId: userID,
					})
					Expect(err).To(HaveOccurred())
					Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
				})
			})

			Describe("RemoveUser", func() {
				var teamID string
				var userID string

				BeforeEach(func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					now := time.Now()
					hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
						Name:       "Remove Test Hackathon",
						Visibility: ents.Visibility_VISIBILITY_PUBLIC,
						StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
						EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
					})
					Expect(err).NotTo(HaveOccurred())

					pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
						HackathonId: hResp.GetHackathonId(),
						Title:       "Remove Project",
						Description: "Desc",
					})
					Expect(err).NotTo(HaveOccurred())

					teamID = uuid.NewString()
					resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
						Name:      "Remove Team",
						ProjectId: pResp.GetProjectId(),
					})
					Expect(err).NotTo(HaveOccurred())
					teamID = resp.GetTeamId()

					u, err := dbClient.User.Create().
						SetKeycloakID("user-to-remove").
						SetUsername("user-to-remove-username").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())
					userID = u.ID.String()

					_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
						TeamId: teamID,
						UserId: userID,
					})
					Expect(err).NotTo(HaveOccurred())
				})

				It("allows member to remove user", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					resp, err := teamClient.RemoveUser(ctx, &teamMsgs.RemoveUserRequest{
						TeamId: teamID,
						UserId: userID,
					})
					Expect(err).NotTo(HaveOccurred())
					Expect(resp.GetTeam().GetMembers()).To(HaveLen(1))
				})

				It("denies removal for non-member", func() {
					nonMemberID := "non-member-remove"
					_, err := dbClient.User.Create().
						SetKeycloakID(nonMemberID).
						SetUsername("non-member-remove").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					token := testutils.CreateTestJWTToken(nonMemberID)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					_, err = teamClient.RemoveUser(ctx, &teamMsgs.RemoveUserRequest{
						TeamId: teamID,
						UserId: userID,
					})
					Expect(err).To(HaveOccurred())
					Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
				})
			})

			Describe("CreateSubmission", func() {
				var teamID string
				var projectID string

				BeforeEach(func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					now := time.Now()
					hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
						Name:       "Submission Test Hackathon",
						Visibility: ents.Visibility_VISIBILITY_PUBLIC,
						StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
						EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
					})
					Expect(err).NotTo(HaveOccurred())

					pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
						HackathonId: hResp.GetHackathonId(),
						Title:       "Submission Project",
						Description: "Desc",
					})
					Expect(err).NotTo(HaveOccurred())
					projectID = pResp.GetProjectId()

					teamID = uuid.NewString()
					resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
						Name:      "Submission Team",
						ProjectId: projectID,
					})
					Expect(err).NotTo(HaveOccurred())
					teamID = resp.GetTeamId()
				})

				It("allows member to create submission", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					resp, err := teamClient.CreateSubmission(ctx, &teamMsgs.CreateSubmissionRequest{
						TeamId:    teamID,
						ProjectId: projectID,
						Result:    testutils.StringPtr("https://github.com/test/repo"),
					})
					Expect(err).NotTo(HaveOccurred())
					Expect(resp.GetId()).NotTo(BeEmpty())

					// Verify in DB
					s, err := dbClient.Submission.Query().
						Where(entsubmission.IDEQ(uuid.MustParse(resp.GetId()))).
						Only(context.Background())
					Expect(err).NotTo(HaveOccurred())
					Expect(s.Version).To(Equal(1))
					Expect(s.Status).To(Equal("draft"))
				})

				It("increments version on subsequent submissions", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					resp, err := teamClient.CreateSubmission(ctx, &teamMsgs.CreateSubmissionRequest{
						TeamId:    teamID,
						ProjectId: projectID,
					})
					Expect(err).NotTo(HaveOccurred())

					resp, err = teamClient.CreateSubmission(ctx, &teamMsgs.CreateSubmissionRequest{
						TeamId:    teamID,
						ProjectId: projectID,
					})
					Expect(err).NotTo(HaveOccurred())

					s, err := dbClient.Submission.Query().
						Where(entsubmission.IDEQ(uuid.MustParse(resp.GetId()))).
						Only(context.Background())
					Expect(err).NotTo(HaveOccurred())
					Expect(s.Version).To(Equal(2))
				})

				It("denies submission for non-member", func() {
					nonMemberID := "non-member-submission"
					_, err := dbClient.User.Create().
						SetKeycloakID(nonMemberID).
						SetUsername("non-member-submission").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					token := testutils.CreateTestJWTToken(nonMemberID)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					_, err = teamClient.CreateSubmission(ctx, &teamMsgs.CreateSubmissionRequest{
						TeamId:    teamID,
						ProjectId: projectID,
					})
					Expect(err).To(HaveOccurred())
					Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
				})
			})

			Describe("FinalizeSubmission", func() {
				var submissionID string

				BeforeEach(func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					now := time.Now()
					hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
						Name:       "Finalize Test Hackathon",
						Visibility: ents.Visibility_VISIBILITY_PUBLIC,
						StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
						EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
					})
					Expect(err).NotTo(HaveOccurred())

					pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
						HackathonId: hResp.GetHackathonId(),
						Title:       "Finalize Project",
						Description: "Desc",
					})
					Expect(err).NotTo(HaveOccurred())
					projectID := pResp.GetProjectId()

					teamID := uuid.NewString()
					resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
						Name:      "Finalize Team",
						ProjectId: projectID,
					})
					Expect(err).NotTo(HaveOccurred())
					teamID = resp.GetTeamId()

					sResp, err := teamClient.CreateSubmission(
						ctx,
						&teamMsgs.CreateSubmissionRequest{
							TeamId:    teamID,
							ProjectId: projectID,
							Result:    testutils.StringPtr("https://github.com/test/repo"),
						},
					)
					Expect(err).NotTo(HaveOccurred())
					submissionID = sResp.GetId()
				})

				It("allows member to finalize submission", func() {
					token := testutils.CreateTestJWTToken(testAdmin)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					resp, err := teamClient.FinalizeSubmission(
						ctx,
						&teamMsgs.FinalizeSubmissionRequest{
							SubmissionId: submissionID,
						},
					)
					Expect(err).NotTo(HaveOccurred())
					Expect(
						resp.GetSubmission().GetStatus(),
					).To(Equal(ents.SubmissionStatus_SUBMISSION_STATUS_FINAL))
				})

				It("denies finalization for non-member", func() {
					nonMemberID := "non-member-finalize"
					_, err := dbClient.User.Create().
						SetKeycloakID(nonMemberID).
						SetUsername("non-member-finalize").
						Save(context.Background())
					Expect(err).NotTo(HaveOccurred())

					token := testutils.CreateTestJWTToken(nonMemberID)
					ctx := metadata.NewOutgoingContext(
						context.Background(),
						metadata.Pairs("authorization", "Bearer "+token),
					)

					_, err = teamClient.FinalizeSubmission(ctx, &teamMsgs.FinalizeSubmissionRequest{
						SubmissionId: submissionID,
					})
					Expect(err).To(HaveOccurred())
					Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
				})
			})

		})
	})
})
