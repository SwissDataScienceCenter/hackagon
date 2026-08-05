//go:build test && unittest

package service_test

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	entvote "github.com/swissdatasciencecenter/hackagon/components/backend/ent/vote"
	entvotecategory "github.com/swissdatasciencecenter/hackagon/components/backend/ent/votecategory"
	entvoteresult "github.com/swissdatasciencecenter/hackagon/components/backend/ent/voteresult"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	hackathonEntities "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackathonMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	phaseMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/phase_svc"
	projectMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/project_svc"
	teamMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/team_svc"
	voteSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote"
	voteEntities "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote/entities"
	voteMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote/messages/vote_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("VoteService", func() {
	var (
		dbClient        *ent.Client
		conn            *grpc.ClientConn
		enf             *middleware.Enforcer
		voteClient      voteSvc.VoteServiceClient
		hackathonClient hackathonSvc.HackathonServiceClient
		phaseClient     hackathonSvc.PhaseServiceClient
		projectClient   hackathonSvc.ProjectServiceClient
		teamClient      hackathonSvc.TeamServiceClient
		testAdmin       string
	)

	BeforeEach(func() {
		dbClient, conn, enf = testutils.CreateTestServer()
		testAdmin = testutils.TestAdminKeycloakID
		voteClient = voteSvc.NewVoteServiceClient(conn)
		hackathonClient = hackathonSvc.NewHackathonServiceClient(conn)
		phaseClient = hackathonSvc.NewPhaseServiceClient(conn)
		projectClient = hackathonSvc.NewProjectServiceClient(conn)
		teamClient = hackathonSvc.NewTeamServiceClient(conn)
	})

	adminCtx := func() context.Context {
		token := testutils.CreateTestJWTToken(testAdmin)
		return metadata.NewOutgoingContext(
			context.Background(),
			metadata.Pairs("authorization", "Bearer "+token),
		)
	}

	createHackathon := func(name string) string {
		resp, err := hackathonClient.Create(adminCtx(), &hackathonMsgs.CreateRequest{
			Name:       name,
			Visibility: hackathonEntities.Visibility_VISIBILITY_PUBLIC,
		})
		Expect(err).NotTo(HaveOccurred())
		return resp.GetHackathonId()
	}

	createPhase := func(hackathonID string) string {
		resp, err := phaseClient.Create(adminCtx(), &phaseMsgs.CreateRequest{
			HackathonId: hackathonID,
			Name:        "Phase",
			Description: "Description",
		})
		Expect(err).NotTo(HaveOccurred())
		return resp.GetPhaseId()
	}

	createProject := func(hackathonID string) string {
		resp, err := projectClient.Propose(adminCtx(), &projectMsgs.ProposeRequest{
			HackathonId: hackathonID,
			Title:       "Project",
			Description: "Project description",
		})
		Expect(err).NotTo(HaveOccurred())
		return resp.GetProjectId()
	}

	createTeam := func(projectID string) string {
		resp, err := teamClient.Create(adminCtx(), &teamMsgs.CreateRequest{
			ProjectId:   projectID,
			Name:        "Team",
			Description: "Team description",
		})
		Expect(err).NotTo(HaveOccurred())
		return resp.GetTeamId()
	}

	createSubmission := func(teamID, projectID string) string {
		resp, err := teamClient.CreateSubmission(adminCtx(), &teamMsgs.CreateSubmissionRequest{
			TeamId:    teamID,
			ProjectId: projectID,
		})
		Expect(err).NotTo(HaveOccurred())
		return resp.GetId()
	}

	createVoteCategory := func(hackathonID string, name string, vm voteEntities.VotingMethod, vt voteEntities.VoterType, mp *int32, juryMemberIDs ...string) string {
		req := &voteMsgs.CreateVoteCategoryRequest{
			HackathonId:  hackathonID,
			Name:         name,
			VotingMethod: vm,
			VoterType:    vt,
			MaxPoints:    mp,
		}
		if len(juryMemberIDs) > 0 {
			req.JuryMemberIds = juryMemberIDs
		}
		resp, err := voteClient.CreateVoteCategory(adminCtx(), req)
		Expect(err).NotTo(HaveOccurred())
		return resp.GetVoteCategory().GetId()
	}

	// grantRole grants a casbin role to a user in a hackathon.
	grantRole := func(keycloakID, hackathonID string, role middleware.Role) {
		_, err := enf.AddRole(keycloakID, role, hackathonID)
		Expect(err).NotTo(HaveOccurred())
	}

	// createAndJoin creates a user, adds them as a hackathon participant, and grants member role.
	createAndJoin := func(hackathonID, username string) (string, string) {
		kcID := uuid.NewString()
		user, err := dbClient.User.Create().
			SetKeycloakID(kcID).
			SetUsername(username).
			SetDisplayName(username).
			SetEmail(username + "@test.com").
			Save(context.Background())
		Expect(err).NotTo(HaveOccurred())
		_, err = dbClient.Participant.Create().
			SetHackathonID(uuid.MustParse(hackathonID)).
			SetUserID(user.ID).
			SetIsWaiting(false).
			Save(context.Background())
		Expect(err).NotTo(HaveOccurred())
		grantRole(kcID, hackathonID, middleware.Member)
		return user.ID.String(), kcID
	}

	// setCapabilities enables capabilities for a hackathon via the admin client.
	setCapabilities := func(hackathonID string, caps ...hackathonEntities.Capability) {
		stateCaps := make([]*hackathonMsgs.CapabilityState, 0, len(caps))
		for _, c := range caps {
			stateCaps = append(stateCaps, &hackathonMsgs.CapabilityState{
				Capability: c,
				Enabled:    true,
			})
		}
		_, err := hackathonClient.SetCapabilities(adminCtx(), &hackathonMsgs.SetCapabilitiesRequest{
			HackathonId:  hackathonID,
			Capabilities: stateCaps,
		})
		Expect(err).NotTo(HaveOccurred())
	}

	Describe("VoteCategory CRUD", func() {
		var hackathonID string
		BeforeEach(func() { hackathonID = createHackathon("VC Test") })

		Describe("CreateVoteCategory", func() {
			It("creates a single choice category", func() {
				resp, err := voteClient.CreateVoteCategory(
					adminCtx(),
					&voteMsgs.CreateVoteCategoryRequest{
						HackathonId:  hackathonID,
						Name:         "Coolness",
						VotingMethod: voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
						VoterType:    voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
					},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetVoteCategory().GetId()).NotTo(BeEmpty())
			})

			It("creates a points category with max_points", func() {
				mp := int32(100)
				resp, err := voteClient.CreateVoteCategory(
					adminCtx(),
					&voteMsgs.CreateVoteCategoryRequest{
						HackathonId:  hackathonID,
						Name:         "Points",
						VotingMethod: voteEntities.VotingMethod_VOTING_METHOD_POINTS,
						VoterType:    voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
						MaxPoints:    &mp,
					},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetVoteCategory().GetMaxPoints()).To(Equal(int32(100)))
			})

			It("requires authentication", func() {
				_, err := voteClient.CreateVoteCategory(
					context.Background(),
					&voteMsgs.CreateVoteCategoryRequest{
						HackathonId:  hackathonID,
						Name:         "Unauthorized",
						VotingMethod: voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
						VoterType:    voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			})

			It("denies non-admin users", func() {
				kcID := uuid.NewString()
				_, err := dbClient.User.Create().
					SetKeycloakID(kcID).
					SetUsername("u").
					SetDisplayName("u").
					SetEmail("u@test.com").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())
				token := testutils.CreateTestJWTToken(kcID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)
				_, err = voteClient.CreateVoteCategory(ctx, &voteMsgs.CreateVoteCategoryRequest{
					HackathonId:  hackathonID,
					Name:         "Unauthorized",
					VotingMethod: voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
					VoterType:    voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				})
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			})

			It("requires max_points for points voting", func() {
				_, err := voteClient.CreateVoteCategory(
					adminCtx(),
					&voteMsgs.CreateVoteCategoryRequest{
						HackathonId:  hackathonID,
						Name:         "No Max",
						VotingMethod: voteEntities.VotingMethod_VOTING_METHOD_POINTS,
						VoterType:    voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Message()).To(ContainSubstring("max_points is required"))
			})

			It("requires max_points > 0", func() {
				mp := int32(0)
				_, err := voteClient.CreateVoteCategory(
					adminCtx(),
					&voteMsgs.CreateVoteCategoryRequest{
						HackathonId:  hackathonID,
						Name:         "Zero",
						VotingMethod: voteEntities.VotingMethod_VOTING_METHOD_POINTS,
						VoterType:    voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
						MaxPoints:    &mp,
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(
					status.Convert(err).Message(),
				).To(ContainSubstring("max_points: must be greater than or equal to 1"))
			})

			It("rejects negative max_points", func() {
				mp := int32(-10)
				_, err := voteClient.CreateVoteCategory(
					adminCtx(),
					&voteMsgs.CreateVoteCategoryRequest{
						HackathonId:  hackathonID,
						Name:         "Neg",
						VotingMethod: voteEntities.VotingMethod_VOTING_METHOD_POINTS,
						VoterType:    voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
						MaxPoints:    &mp,
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(
					status.Convert(err).Message(),
				).To(ContainSubstring("max_points: must be greater than or equal to 1"))
			})

			It("returns NOT_FOUND for invalid hackathon", func() {
				_, err := voteClient.CreateVoteCategory(
					adminCtx(),
					&voteMsgs.CreateVoteCategoryRequest{
						HackathonId:  uuid.NewString(),
						Name:         "Invalid",
						VotingMethod: voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
						VoterType:    voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
			})
		})

		Describe("GetVoteCategory", func() {
			var catID string
			BeforeEach(func() {
				catID = createVoteCategory(
					hackathonID,
					"Get",
					voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
					voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
					nil,
				)
			})

			It("retrieves category", func() {
				resp, err := voteClient.GetVoteCategory(
					adminCtx(),
					&voteMsgs.GetVoteCategoryRequest{Id: catID},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetVoteCategory().GetId()).To(Equal(catID))
			})

			It("returns NOT_FOUND", func() {
				_, err := voteClient.GetVoteCategory(
					adminCtx(),
					&voteMsgs.GetVoteCategoryRequest{Id: uuid.NewString()},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
			})
		})

		Describe("ListVoteCategories", func() {
			It("lists categories", func() {
				for i := 0; i < 3; i++ {
					createVoteCategory(
						hackathonID,
						"Cat"+string(rune('A'+i)),
						voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
						voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
						nil,
					)
				}
				resp, err := voteClient.ListVoteCategories(
					adminCtx(),
					&voteMsgs.ListVoteCategoriesRequest{HackathonId: hackathonID},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetVoteCategories()).To(HaveLen(3))
			})

			It("returns empty for no categories", func() {
				newHID := createHackathon("Empty")
				resp, err := voteClient.ListVoteCategories(
					adminCtx(),
					&voteMsgs.ListVoteCategoriesRequest{HackathonId: newHID},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetVoteCategories()).To(BeEmpty())
			})
		})

		Describe("EditVoteCategory", func() {
			var catID string
			BeforeEach(func() {
				catID = createVoteCategory(
					hackathonID,
					"Orig",
					voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
					voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
					nil,
				)
			})

			It("updates name", func() {
				_, err := voteClient.EditVoteCategory(
					adminCtx(),
					&voteMsgs.EditVoteCategoryRequest{Id: catID, Name: testutils.StringPtr("New")},
				)
				Expect(err).NotTo(HaveOccurred())
				resp, err := voteClient.GetVoteCategory(
					adminCtx(),
					&voteMsgs.GetVoteCategoryRequest{Id: catID},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetVoteCategory().GetName()).To(Equal("New"))
			})

			It("updates voting method", func() {
				_, err := voteClient.EditVoteCategory(
					adminCtx(),
					&voteMsgs.EditVoteCategoryRequest{
						Id: catID,
						VotingMethod: testutils.EnumPtr(
							voteEntities.VotingMethod_VOTING_METHOD_RANKED,
						),
					},
				)
				Expect(err).NotTo(HaveOccurred())
				resp, err := voteClient.GetVoteCategory(
					adminCtx(),
					&voteMsgs.GetVoteCategoryRequest{Id: catID},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(
					resp.GetVoteCategory().GetVotingMethod(),
				).To(Equal(voteEntities.VotingMethod_VOTING_METHOD_RANKED))
			})

			It("updates max_points", func() {
				mp := int32(50)
				_, err := voteClient.EditVoteCategory(
					adminCtx(),
					&voteMsgs.EditVoteCategoryRequest{Id: catID, MaxPoints: &mp},
				)
				Expect(err).NotTo(HaveOccurred())
				resp, err := voteClient.GetVoteCategory(
					adminCtx(),
					&voteMsgs.GetVoteCategoryRequest{Id: catID},
				)
				Expect(err).NotTo(HaveOccurred())
				// points not updated if method is not points
				Expect(resp.GetVoteCategory().GetMaxPoints()).To(Equal(int32(0)))

				_, err = voteClient.EditVoteCategory(
					adminCtx(),
					&voteMsgs.EditVoteCategoryRequest{
						Id:        catID,
						MaxPoints: &mp,
						VotingMethod: testutils.EnumPtr(
							voteEntities.VotingMethod_VOTING_METHOD_POINTS,
						),
					},
				)
				Expect(err).NotTo(HaveOccurred())
				resp, err = voteClient.GetVoteCategory(
					adminCtx(),
					&voteMsgs.GetVoteCategoryRequest{Id: catID},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetVoteCategory().GetMaxPoints()).To(Equal(int32(50)))
			})

			It("deletes votes on voting method change", func() {
				h2 := createHackathon("Vote Delete")
				_ = createPhase(h2)
				pID := createProject(h2)
				tID := createTeam(pID)
				sID := createSubmission(tID, pID)
				catID2 := createVoteCategory(
					h2,
					"Single Choice",
					voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
					voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
					nil,
				)
				_, kc := createAndJoin(h2, "ext")
				setCapabilities(h2, hackathonEntities.Capability_CAPABILITY_VOTE)
				token := testutils.CreateTestJWTToken(kc)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)
				_, err := voteClient.SubmitVote(
					ctx,
					&voteMsgs.SubmitVoteRequest{
						CategoryId: catID2,
						Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
							SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: sID},
						},
					},
				)
				Expect(err).NotTo(HaveOccurred())
				count, _ := dbClient.Vote.Query().
					Where(entvote.HasCategoryWith(entvotecategory.IDEQ(uuid.MustParse(catID2)))).
					Count(context.Background())
				Expect(count).To(Equal(1))
				_, err = voteClient.EditVoteCategory(
					adminCtx(),
					&voteMsgs.EditVoteCategoryRequest{
						Id: catID2,
						VotingMethod: testutils.EnumPtr(
							voteEntities.VotingMethod_VOTING_METHOD_RANKED,
						),
					},
				)
				Expect(err).NotTo(HaveOccurred())
				count, _ = dbClient.Vote.Query().
					Where(entvote.HasCategoryWith(entvotecategory.IDEQ(uuid.MustParse(catID2)))).
					Count(context.Background())
				Expect(count).To(Equal(0))
			})

			It("requires max_points when changing to points", func() {
				_, err := voteClient.EditVoteCategory(
					adminCtx(),
					&voteMsgs.EditVoteCategoryRequest{
						Id: catID,
						VotingMethod: testutils.EnumPtr(
							voteEntities.VotingMethod_VOTING_METHOD_POINTS,
						),
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Message()).To(ContainSubstring("max_points is required"))
			})

			It("requires max_points > 0", func() {
				_, err := voteClient.EditVoteCategory(
					adminCtx(),
					&voteMsgs.EditVoteCategoryRequest{Id: catID, MaxPoints: testutils.Int32Ptr(0)},
				)
				Expect(err).To(HaveOccurred())
				Expect(
					status.Convert(err).Message(),
				).To(ContainSubstring("max_points: must be greater than or equal to 1"))
			})

			It("returns NOT_FOUND", func() {
				_, err := voteClient.EditVoteCategory(
					adminCtx(),
					&voteMsgs.EditVoteCategoryRequest{
						Id:   uuid.NewString(),
						Name: testutils.StringPtr("X"),
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
			})
		})

		Describe("DeleteVoteCategory", func() {
			var catID string
			BeforeEach(func() {
				catID = createVoteCategory(
					hackathonID,
					"Del",
					voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
					voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
					nil,
				)
			})

			It("deletes category", func() {
				_, err := voteClient.DeleteVoteCategory(
					adminCtx(),
					&voteMsgs.DeleteVoteCategoryRequest{Id: catID},
				)
				Expect(err).NotTo(HaveOccurred())
				_, err = dbClient.VoteCategory.Query().
					Where(entvotecategory.IDEQ(uuid.MustParse(catID))).
					Only(context.Background())
				Expect(err).To(HaveOccurred())
				Expect(ent.IsNotFound(err)).To(BeTrue())
			})

			It("returns NOT_FOUND", func() {
				_, err := voteClient.DeleteVoteCategory(
					adminCtx(),
					&voteMsgs.DeleteVoteCategoryRequest{Id: uuid.NewString()},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
			})

			It("requires authentication", func() {
				_, err := voteClient.DeleteVoteCategory(
					context.Background(),
					&voteMsgs.DeleteVoteCategoryRequest{Id: catID},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			})
		})
	})

	Describe("SubmitVote", func() {
		var (
			hackathonID, projectID, teamID, submissionID, categoryID string
			user1DB, user1KC, user2DB                                string
		)
		BeforeEach(func() {
			hackathonID = createHackathon("Submit Vote")
			projectID = createProject(hackathonID)
			teamID = createTeam(projectID)
			submissionID = createSubmission(teamID, projectID)
			user1DB, user1KC = createAndJoin(hackathonID, "u1")
			user2DB, _ = createAndJoin(hackathonID, "u2")
			_, err := teamClient.AssignUser(
				adminCtx(),
				&teamMsgs.AssignUserRequest{TeamId: teamID, UserId: user1DB},
			)
			Expect(err).NotTo(HaveOccurred())
			_, err = teamClient.AssignUser(
				adminCtx(),
				&teamMsgs.AssignUserRequest{TeamId: teamID, UserId: user2DB},
			)
			Expect(err).NotTo(HaveOccurred())
			categoryID = createVoteCategory(
				hackathonID,
				"Single Choice",
				voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				nil,
			)
			setCapabilities(hackathonID, hackathonEntities.Capability_CAPABILITY_VOTE)
		})

		It("submits single choice vote", func() {
			_, kc := createAndJoin(hackathonID, "ext")
			token := testutils.CreateTestJWTToken(kc)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			resp, err := voteClient.SubmitVote(ctx, &voteMsgs.SubmitVoteRequest{
				CategoryId: categoryID,
				Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
					SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
				},
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetVotes()).To(HaveLen(1))
		})

		It("submits ranked vote", func() {
			p2 := createProject(hackathonID)
			t2 := createTeam(p2)
			s2 := createSubmission(t2, p2)
			catID := createVoteCategory(
				hackathonID,
				"Ranked",
				voteEntities.VotingMethod_VOTING_METHOD_RANKED,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				nil,
			)
			_, kc := createAndJoin(hackathonID, "ext")
			token := testutils.CreateTestJWTToken(kc)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			resp, err := voteClient.SubmitVote(ctx, &voteMsgs.SubmitVoteRequest{
				CategoryId: catID,
				Vote: &voteMsgs.SubmitVoteRequest_Ranked{
					Ranked: &voteMsgs.RankedVote{
						Submissions: []*voteMsgs.RankedSubmission{
							{SubmissionId: submissionID, Rank: 1},
							{SubmissionId: s2, Rank: 2},
						},
					},
				},
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetVotes()).To(HaveLen(2))
		})

		It("submits points vote", func() {
			mp := int32(100)
			catID := createVoteCategory(
				hackathonID,
				"Points",
				voteEntities.VotingMethod_VOTING_METHOD_POINTS,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				&mp,
			)
			p2 := createProject(hackathonID)
			t2 := createTeam(p2)
			s2 := createSubmission(t2, p2)
			_, kc := createAndJoin(hackathonID, "ext")
			token := testutils.CreateTestJWTToken(kc)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			resp, err := voteClient.SubmitVote(ctx, &voteMsgs.SubmitVoteRequest{
				CategoryId: catID,
				Vote: &voteMsgs.SubmitVoteRequest_Points{
					Points: &voteMsgs.PointsVote{
						Submissions: []*voteMsgs.PointsSubmission{
							{SubmissionId: submissionID, Points: 60},
							{SubmissionId: s2, Points: 40},
						},
					},
				},
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetVotes()).To(HaveLen(2))
		})

		It("prevents voting on own team", func() {
			token := testutils.CreateTestJWTToken(user1KC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err := voteClient.SubmitVote(ctx, &voteMsgs.SubmitVoteRequest{
				CategoryId: categoryID,
				Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
					SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
				},
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			Expect(
				status.Convert(err).Message(),
			).To(ContainSubstring("cannot vote on your own team's submission"))
		})

		It("prevents exceeding max_points", func() {
			mp := int32(50)
			catID := createVoteCategory(
				hackathonID,
				"Limited",
				voteEntities.VotingMethod_VOTING_METHOD_POINTS,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				&mp,
			)
			p2 := createProject(hackathonID)
			t2 := createTeam(p2)
			s2 := createSubmission(t2, p2)
			_, kc := createAndJoin(hackathonID, "ext")
			token := testutils.CreateTestJWTToken(kc)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err := voteClient.SubmitVote(ctx, &voteMsgs.SubmitVoteRequest{
				CategoryId: catID,
				Vote: &voteMsgs.SubmitVoteRequest_Points{
					Points: &voteMsgs.PointsVote{
						Submissions: []*voteMsgs.PointsSubmission{
							{SubmissionId: submissionID, Points: 30},
							{SubmissionId: s2, Points: 30},
						},
					},
				},
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Message()).To(ContainSubstring("exceeds category limit"))
		})

		It("validates vote type matches category", func() {
			catID := createVoteCategory(
				hackathonID,
				"SC Only",
				voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				nil,
			)
			_, kc := createAndJoin(hackathonID, "ext")
			token := testutils.CreateTestJWTToken(kc)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err := voteClient.SubmitVote(ctx, &voteMsgs.SubmitVoteRequest{
				CategoryId: catID,
				Vote: &voteMsgs.SubmitVoteRequest_Ranked{
					Ranked: &voteMsgs.RankedVote{
						Submissions: []*voteMsgs.RankedSubmission{
							{SubmissionId: submissionID, Rank: 1},
						},
					},
				},
			})
			Expect(err).To(HaveOccurred())
			Expect(
				status.Convert(err).Message(),
			).To(ContainSubstring("only supports vote type single_choice"))
		})

		It("is idempotent", func() {
			_, kc := createAndJoin(hackathonID, "ext")
			token := testutils.CreateTestJWTToken(kc)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			r1, err := voteClient.SubmitVote(
				ctx,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).NotTo(HaveOccurred())
			r2, err := voteClient.SubmitVote(
				ctx,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(r1.GetVotes()[0].GetId()).To(Equal(r2.GetVotes()[0].GetId()))
			count, err := dbClient.Vote.Query().
				Where(entvote.HasCategoryWith(entvotecategory.IDEQ(uuid.MustParse(categoryID)))).
				Count(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(count).To(Equal(1))
		})

		It("returns NOT_FOUND for invalid category", func() {
			_, kc := createAndJoin(hackathonID, "ext")
			token := testutils.CreateTestJWTToken(kc)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err := voteClient.SubmitVote(
				ctx,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: uuid.NewString(),
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
		})

		It("requires authentication", func() {
			_, err := voteClient.SubmitVote(
				context.Background(),
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.Unauthenticated))
		})
	})

	Describe("Jury Voting", func() {
		var (
			hid, projectID, teamID, submissionID, categoryID string
			juryUser1DB, juryUser2DB                         *ent.User
			juryUser1KC, juryUser2KC, nonJuryUserKC          string
		)

		BeforeEach(func() {
			hid = createHackathon("Jury Vote")
			projectID = createProject(hid)
			teamID = createTeam(projectID)
			submissionID = createSubmission(teamID, projectID)

			// Create two jury members
			_, juryUser1KC = createAndJoin(hid, "jury1")
			_, juryUser2KC = createAndJoin(hid, "jury2")
			var err error
			juryUser1DB, err = dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(juryUser1KC)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			juryUser2DB, err = dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(juryUser2KC)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Create a non-jury participant
			_, nonJuryUserKC = createAndJoin(hid, "participant")

			// Create a jury category with juryUser1 as the only jury member
			categoryID = createVoteCategory(
				hid,
				"Jury Category",
				voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
				voteEntities.VoterType_VOTER_TYPE_JURY,
				nil,
				juryUser1DB.ID.String(),
			)
			setCapabilities(hid, hackathonEntities.Capability_CAPABILITY_VOTE)
		})

		It("allows jury member to vote", func() {
			token := testutils.CreateTestJWTToken(juryUser1KC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			resp, err := voteClient.SubmitVote(
				ctx,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetVotes()).To(HaveLen(1))
		})

		It("denies non-jury participant from voting", func() {
			token := testutils.CreateTestJWTToken(nonJuryUserKC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err := voteClient.SubmitVote(
				ctx,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			Expect(status.Convert(err).Message()).To(ContainSubstring("not a jury member"))
		})

		It("denies other jury member who is not assigned", func() {
			// juryUser2 exists but is NOT in the jury_member_ids list
			token := testutils.CreateTestJWTToken(juryUser2KC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err := voteClient.SubmitVote(
				ctx,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			Expect(status.Convert(err).Message()).To(ContainSubstring("not a jury member"))
		})

		It("allows adding jury member via EditVoteCategory", func() {
			// First verify juryUser2 cannot vote
			token2 := testutils.CreateTestJWTToken(juryUser2KC)
			ctx2 := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token2),
			)
			_, err := voteClient.SubmitVote(
				ctx2,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).To(HaveOccurred())

			// Add juryUser2 via EditVoteCategory
			_, err = voteClient.EditVoteCategory(adminCtx(), &voteMsgs.EditVoteCategoryRequest{
				Id:            categoryID,
				JuryMemberIds: []string{juryUser1DB.ID.String(), juryUser2DB.ID.String()},
			})
			Expect(err).NotTo(HaveOccurred())

			// Now juryUser2 should be able to vote
			resp, err := voteClient.SubmitVote(
				ctx2,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetVotes()).To(HaveLen(1))
		})

		It("allows multiple jury members to vote", func() {
			// Add both jury members
			_, err := voteClient.EditVoteCategory(adminCtx(), &voteMsgs.EditVoteCategoryRequest{
				Id:            categoryID,
				JuryMemberIds: []string{juryUser1DB.ID.String(), juryUser2DB.ID.String()},
			})
			Expect(err).NotTo(HaveOccurred())

			// Both should be able to vote
			token1 := testutils.CreateTestJWTToken(juryUser1KC)
			ctx1 := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token1),
			)
			resp1, err := voteClient.SubmitVote(
				ctx1,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp1.GetVotes()).To(HaveLen(1))

			token2 := testutils.CreateTestJWTToken(juryUser2KC)
			ctx2 := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token2),
			)
			resp2, err := voteClient.SubmitVote(
				ctx2,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp2.GetVotes()).To(HaveLen(1))
		})
	})

	Describe("GetVote", func() {
		var voteID, userKC, categoryID, submissionID string
		BeforeEach(func() {
			hid := createHackathon("Get Vote")
			pid := createProject(hid)
			tid := createTeam(pid)
			submissionID = createSubmission(tid, pid)
			_, userKC = createAndJoin(hid, "gv")
			categoryID = createVoteCategory(
				hid,
				"Single Choice",
				voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				nil,
			)
			setCapabilities(hid, hackathonEntities.Capability_CAPABILITY_VOTE)
			token := testutils.CreateTestJWTToken(userKC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			resp, _ := voteClient.SubmitVote(
				ctx,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			voteID = resp.GetVotes()[0].GetId()
		})

		It("retrieves vote", func() {
			token := testutils.CreateTestJWTToken(userKC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			resp, err := voteClient.GetVote(ctx, &voteMsgs.GetVoteRequest{Id: voteID})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetVote().GetId()).To(Equal(voteID))
		})

		It("returns NOT_FOUND", func() {
			token := testutils.CreateTestJWTToken(userKC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err := voteClient.GetVote(ctx, &voteMsgs.GetVoteRequest{Id: uuid.NewString()})
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
		})
	})

	Describe("ListVotes", func() {
		var userKC, categoryID, submissionID, hid string
		BeforeEach(func() {
			hid = createHackathon("List Votes")
			pid := createProject(hid)
			tid := createTeam(pid)
			submissionID = createSubmission(tid, pid)
			_, userKC = createAndJoin(hid, "lv")
			categoryID = createVoteCategory(
				hid,
				"Single Choice",
				voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				nil,
			)
			setCapabilities(hid, hackathonEntities.Capability_CAPABILITY_VOTE)
			token := testutils.CreateTestJWTToken(userKC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err := voteClient.SubmitVote(
				ctx,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).NotTo(HaveOccurred())
		})

		It("lists by category", func() {
			// Grant Owner so Member gets Vote.Read (listing all votes requires RBAC)
			grantRole(userKC, hid, middleware.Owner)
			token := testutils.CreateTestJWTToken(userKC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			resp, err := voteClient.ListVotes(
				ctx,
				&voteMsgs.ListVotesRequest{
					HackathonId: hid,
					CategoryId:  &categoryID,
				},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetVotes()).To(HaveLen(1))
		})

		It("lists by voter", func() {
			// Listing own votes: no RBAC needed, just pass DB UUID (handler compares against u.ID.String())
			// We need the DB UUID — re-query it since createAndJoin only returns Keycloak ID
			user, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(userKC)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			voterID := user.ID.String()
			token := testutils.CreateTestJWTToken(userKC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			resp, err := voteClient.ListVotes(
				ctx,
				&voteMsgs.ListVotesRequest{
					HackathonId: hid,
					VoterId:     &voterID,
				},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetVotes()).To(HaveLen(1))
		})

		It("denies listing other members' votes", func() {
			// Create a second member who also votes
			_, user2KC := createAndJoin(hid, "lv2")
			user2, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(user2KC)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			user2Token := testutils.CreateTestJWTToken(user2KC)
			user2Ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+user2Token),
			)
			_, err = voteClient.SubmitVote(
				user2Ctx,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).NotTo(HaveOccurred())

			// First member tries to list by second member's DB UUID — should be denied
			voterID := user2.ID.String()
			token := testutils.CreateTestJWTToken(userKC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err = voteClient.ListVotes(
				ctx,
				&voteMsgs.ListVotesRequest{
					HackathonId: hid,
					VoterId:     &voterID,
				},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
		})

		It("returns empty for no votes", func() {
			hid := createHackathon("Empty")
			_, userKC2 := createAndJoin(hid, "lv2")
			grantRole(userKC2, hid, middleware.Owner)
			catID := createVoteCategory(
				hid,
				"Empty",
				voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				nil,
			)
			token := testutils.CreateTestJWTToken(userKC2)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			resp, err := voteClient.ListVotes(
				ctx,
				&voteMsgs.ListVotesRequest{
					HackathonId: hid,
					CategoryId:  &catID,
				},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetVotes()).To(BeEmpty())
		})
	})

	Describe("Vote Results CRUD", func() {
		var catID, submissionID string
		BeforeEach(func() {
			hid := createHackathon("Vote Result")
			_ = createPhase(hid)
			pid := createProject(hid)
			tid := createTeam(pid)
			submissionID = createSubmission(tid, pid)
			catID = createVoteCategory(
				hid,
				"Single Choice",
				voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				nil,
			)
		})

		Describe("CreateVoteResult", func() {
			It("creates result", func() {
				resp, err := voteClient.CreateVoteResult(
					adminCtx(),
					&voteMsgs.CreateVoteResultRequest{
						CategoryId:   catID,
						SubmissionId: submissionID,
						Position:     1,
					},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetVoteResult().GetPosition()).To(Equal(int32(1)))
			})

			It("creates with title", func() {
				resp, err := voteClient.CreateVoteResult(
					adminCtx(),
					&voteMsgs.CreateVoteResultRequest{
						CategoryId:   catID,
						SubmissionId: submissionID,
						Position:     1,
						Title:        testutils.StringPtr("Best"),
					},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetVoteResult().GetTitle()).To(Equal("Best"))
			})

			It("returns NOT_FOUND", func() {
				_, err := voteClient.CreateVoteResult(
					adminCtx(),
					&voteMsgs.CreateVoteResultRequest{
						CategoryId:   uuid.NewString(),
						SubmissionId: submissionID,
						Position:     1,
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
			})

			It("requires authentication", func() {
				_, err := voteClient.CreateVoteResult(
					context.Background(),
					&voteMsgs.CreateVoteResultRequest{
						CategoryId:   catID,
						SubmissionId: submissionID,
						Position:     1,
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			})

			It("denies non-admin", func() {
				kcID := uuid.NewString()
				_, err := dbClient.User.Create().
					SetKeycloakID(kcID).
					SetUsername("u").
					SetDisplayName("u").
					SetEmail("u@test.com").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())
				token := testutils.CreateTestJWTToken(kcID)
				ctx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+token),
				)
				_, err = voteClient.CreateVoteResult(
					ctx,
					&voteMsgs.CreateVoteResultRequest{
						CategoryId:   catID,
						SubmissionId: submissionID,
						Position:     1,
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.PermissionDenied))
			})
		})

		Describe("EditVoteResult", func() {
			var resultID string
			BeforeEach(func() {
				resp, err := voteClient.CreateVoteResult(
					adminCtx(),
					&voteMsgs.CreateVoteResultRequest{
						CategoryId:   catID,
						SubmissionId: submissionID,
						Position:     1,
					},
				)
				Expect(err).NotTo(HaveOccurred())
				resultID = resp.GetVoteResult().GetId()
			})

			It("updates position", func() {
				_, err := voteClient.EditVoteResult(
					adminCtx(),
					&voteMsgs.EditVoteResultRequest{Id: resultID, Position: testutils.Int32Ptr(2)},
				)
				Expect(err).NotTo(HaveOccurred())
				result, err := dbClient.VoteResult.Query().
					Where(entvoteresult.IDEQ(uuid.MustParse(resultID))).
					Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				Expect(result.Position).To(Equal(2))
			})

			It("updates title", func() {
				_, err := voteClient.EditVoteResult(
					adminCtx(),
					&voteMsgs.EditVoteResultRequest{
						Id:    resultID,
						Title: testutils.StringPtr("New"),
					},
				)
				Expect(err).NotTo(HaveOccurred())
				result, err := dbClient.VoteResult.Query().
					Where(entvoteresult.IDEQ(uuid.MustParse(resultID))).
					Only(context.Background())
				Expect(err).NotTo(HaveOccurred())
				Expect(result.Title).To(Equal("New"))
			})

			It("returns NOT_FOUND", func() {
				_, err := voteClient.EditVoteResult(
					adminCtx(),
					&voteMsgs.EditVoteResultRequest{
						Id:       uuid.NewString(),
						Position: testutils.Int32Ptr(2),
					},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
			})
		})

		Describe("DeleteVoteResult", func() {
			var resultID string
			BeforeEach(func() {
				resp, err := voteClient.CreateVoteResult(
					adminCtx(),
					&voteMsgs.CreateVoteResultRequest{
						CategoryId:   catID,
						SubmissionId: submissionID,
						Position:     1,
					},
				)
				Expect(err).NotTo(HaveOccurred())
				resultID = resp.GetVoteResult().GetId()
			})

			It("deletes result", func() {
				_, err := voteClient.DeleteVoteResult(
					adminCtx(),
					&voteMsgs.DeleteVoteResultRequest{Id: resultID},
				)
				Expect(err).NotTo(HaveOccurred())
				_, err = dbClient.VoteResult.Query().
					Where(entvoteresult.IDEQ(uuid.MustParse(resultID))).
					Only(context.Background())
				Expect(err).To(HaveOccurred())
				Expect(ent.IsNotFound(err)).To(BeTrue())
			})

			It("returns NOT_FOUND", func() {
				_, err := voteClient.DeleteVoteResult(
					adminCtx(),
					&voteMsgs.DeleteVoteResultRequest{Id: uuid.NewString()},
				)
				Expect(err).To(HaveOccurred())
				Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
			})
		})

		Describe("ListVoteResults", func() {
			BeforeEach(func() {
				for i := 1; i <= 3; i++ {
					_, err := voteClient.CreateVoteResult(
						adminCtx(),
						&voteMsgs.CreateVoteResultRequest{
							CategoryId:   catID,
							SubmissionId: submissionID,
							Position:     int32(i),
						},
					)
					Expect(err).NotTo(HaveOccurred())
				}
			})

			It("lists results", func() {
				resp, err := voteClient.ListVoteResults(
					adminCtx(),
					&voteMsgs.ListVoteResultsRequest{CategoryId: catID},
				)
				Expect(err).NotTo(HaveOccurred())
				Expect(resp.GetVoteResults()).To(HaveLen(3))
			})

			It("returns sorted by position", func() {
				resp, err := voteClient.ListVoteResults(
					adminCtx(),
					&voteMsgs.ListVoteResultsRequest{CategoryId: catID},
				)
				Expect(err).NotTo(HaveOccurred())
				for i, r := range resp.GetVoteResults() {
					Expect(r.GetPosition()).To(Equal(int32(i + 1)))
				}
			})
		})
	})

	Describe("ExportVotes", func() {
		var userKC, categoryID, submissionID string
		BeforeEach(func() {
			hid := createHackathon("Export Votes")
			pid := createProject(hid)
			tid := createTeam(pid)
			submissionID = createSubmission(tid, pid)
			_, userKC = createAndJoin(hid, "ev")
			grantRole(userKC, hid, middleware.Owner)
			categoryID = createVoteCategory(
				hid,
				"Single Choice",
				voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				nil,
			)
			setCapabilities(hid, hackathonEntities.Capability_CAPABILITY_VOTE)
			token := testutils.CreateTestJWTToken(userKC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err := voteClient.SubmitVote(
				ctx,
				&voteMsgs.SubmitVoteRequest{
					CategoryId: categoryID,
					Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
						SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
					},
				},
			)
			Expect(err).NotTo(HaveOccurred())
		})

		It("exports CSV", func() {
			token := testutils.CreateTestJWTToken(userKC)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			resp, err := voteClient.ExportVotes(
				ctx,
				&voteMsgs.ExportVotesRequest{
					CategoryId: categoryID,
					Format:     voteMsgs.ExportFormat_EXPORT_FORMAT_CSV,
				},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetData()).NotTo(BeEmpty())
		})

		It("returns NOT_FOUND", func() {
			_, err := voteClient.ExportVotes(
				adminCtx(),
				&voteMsgs.ExportVotesRequest{CategoryId: uuid.NewString()},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
		})
	})

	Describe("ExportResults", func() {
		var catID, submissionID string
		BeforeEach(func() {
			hid := createHackathon("Export Results")
			_ = createPhase(hid)
			pid := createProject(hid)
			tid := createTeam(pid)
			submissionID = createSubmission(tid, pid)
			catID = createVoteCategory(
				hid,
				"Single Choice",
				voteEntities.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
				voteEntities.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
				nil,
			)
			_, err := voteClient.CreateVoteResult(
				adminCtx(),
				&voteMsgs.CreateVoteResultRequest{
					CategoryId:   catID,
					SubmissionId: submissionID,
					Position:     1,
				},
			)
			Expect(err).NotTo(HaveOccurred())
		})

		It("exports CSV", func() {
			resp, err := voteClient.ExportResults(
				adminCtx(),
				&voteMsgs.ExportResultsRequest{
					CategoryId: catID,
					Format:     voteMsgs.ExportFormat_EXPORT_FORMAT_CSV,
				},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetData()).NotTo(BeEmpty())
		})

		It("returns NOT_FOUND", func() {
			_, err := voteClient.ExportResults(
				adminCtx(),
				&voteMsgs.ExportResultsRequest{
					CategoryId: uuid.NewString(),
					Format:     voteMsgs.ExportFormat_EXPORT_FORMAT_CSV,
				},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Convert(err).Code()).To(Equal(codes.NotFound))
		})
	})
})
