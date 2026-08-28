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
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
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
		enf             *middleware.Enforcer
		teamClient      hackathonSvc.TeamServiceClient
		hackathonClient hackathonSvc.HackathonServiceClient
		projectClient   hackathonSvc.ProjectServiceClient
	)

	BeforeEach(func() {
		dbClient, conn, enf = testutils.CreateTestServer()

		teamClient = hackathonSvc.NewTeamServiceClient(conn)
		hackathonClient = hackathonSvc.NewHackathonServiceClient(conn)
		projectClient = hackathonSvc.NewProjectServiceClient(conn)
	})

	Describe("Create", func() {
		It("creates a team successfully", func() {
			// Create a non-admin hackathon owner.
			ownerID := "team-create-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-create-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Grant hackathon creation permission.
			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create hackathon and project.
			now := time.Now()
			hackathonResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Team Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			// Enable propose_projects capability (disabled by default)
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Capabilities: []*msgs.CapabilityState{
					{Capability: ents.Capability_CAPABILITY_PROPOSE_PROJECTS, Enabled: true},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			// Enable create_project_submissions capability (disabled by default)
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Capabilities: []*msgs.CapabilityState{
					{
						Capability: ents.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
						Enabled:    true,
					},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			projectResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Title:       "Test Project",
				Description: "Test project description",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: projectResp.GetProjectId(),
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

			// Assign creator as team member (creator is not auto-assigned).
			ownerUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(ownerID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamID,
				UserId: ownerUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify in DB.
			t, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(t.Name).To(Equal("Dream Team"))
			Expect(t.Edges.Members).To(HaveLen(1))
			Expect(t.Edges.Members[0].KeycloakID).To(Equal(ownerID))
		})

		It("returns NOT_FOUND for invalid project ID", func() {
			ownerID := "team-create-invalid-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-create-invalid-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			req := &teamMsgs.CreateRequest{
				Name:      "Fail Team",
				ProjectId: uuid.NewString(),
			}

			_, err = teamClient.Create(ctx, req)
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.NotFound))
		})

		It("returns INVALID_ARGUMENT for proposed project", func() {
			ownerID := "team-create-proposed"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-create-proposed").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			hackathonResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Team Proposed Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			// Enable propose_projects capability (disabled by default)
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Capabilities: []*msgs.CapabilityState{
					{Capability: ents.Capability_CAPABILITY_PROPOSE_PROJECTS, Enabled: true},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			// Propose a project — it is proposed, not approved.
			projectResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Title:       "Proposed Project",
				Description: "Not yet approved",
			})
			Expect(err).NotTo(HaveOccurred())

			// Attempt to create a team for the proposed project.
			req := &teamMsgs.CreateRequest{
				Name:      "Dream Team",
				ProjectId: projectResp.GetProjectId(),
			}

			_, err = teamClient.Create(ctx, req)
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.InvalidArgument))
		})
	})
	Describe("Get", func() {
		var teamID string
		var hackathonID string
		var ownerID string

		BeforeEach(func() {
			ownerID = "team-get-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-get-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
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
			// Enable VIEW_TEAMS
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hackathonID,
				Capabilities: []*msgs.CapabilityState{
					{Capability: ents.Capability_CAPABILITY_VIEW_TEAMS, Enabled: true},
				},
			})

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       "Get Test Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
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
			token := testutils.CreateTestJWTToken(ownerID)
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
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := teamClient.Get(ctx, &teamMsgs.GetRequest{TeamId: uuid.NewString()})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.NotFound))
		})

		It("denies team get when view_teams capability is disabled", func() {
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			memberID := "team-get-member"
			_, err := dbClient.User.Create().
				SetKeycloakID(memberID).
				SetUsername("team-get-member-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			_, err = enf.AddRole(memberID, middleware.Member, hackathonID)
			Expect(err).NotTo(HaveOccurred())

			token = testutils.CreateTestJWTToken(memberID)
			memberctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := teamClient.Get(memberctx, &teamMsgs.GetRequest{TeamId: teamID})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetTeam().GetId()).To(Equal(teamID))

			// disable VIEW_TEAMS
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hackathonID,
				Capabilities: []*msgs.CapabilityState{
					{Capability: ents.Capability_CAPABILITY_VIEW_TEAMS, Enabled: false},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = teamClient.Get(memberctx, &teamMsgs.GetRequest{TeamId: teamID})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("List", func() {
		var hackathonID string
		var ownerID string

		BeforeEach(func() {
			ownerID = "team-list-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-list-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
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
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hackathonID,
				Capabilities: []*msgs.CapabilityState{
					{Capability: ents.Capability_CAPABILITY_VIEW_TEAMS, Enabled: true},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       "List Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
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
			token := testutils.CreateTestJWTToken(ownerID)
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
			token := testutils.CreateTestJWTToken(ownerID)
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

		It("denies team list when view_teams capability is disabled", func() {
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			// Create a member (not owner) of the hackathon
			memberID := "team-list-member"
			_, err := dbClient.User.Create().
				SetKeycloakID(memberID).
				SetUsername("team-list-member-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			_, err = enf.AddRole(memberID, middleware.Member, hackathonID)
			Expect(err).NotTo(HaveOccurred())

			token = testutils.CreateTestJWTToken(memberID)
			memberctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := teamClient.List(
				memberctx,
				&teamMsgs.ListRequest{HackathonId: testutils.StringPtr(hackathonID)},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetTeams()).To(HaveLen(2))

			// Enable VIEW_TEAMS via SetCapabilities
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hackathonID,
				Capabilities: []*msgs.CapabilityState{
					{Capability: ents.Capability_CAPABILITY_VIEW_TEAMS, Enabled: false},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = teamClient.List(
				memberctx,
				&teamMsgs.ListRequest{HackathonId: testutils.StringPtr(hackathonID)},
			)
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Edit", func() {
		var teamID string
		var hackathonID string
		var ownerID string
		var memberID string

		BeforeEach(func() {
			ownerID = "team-edit-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-edit-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Edit Test Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = hResp.GetHackathonId()

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "Edit Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())

			teamID = uuid.NewString()
			resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Original Name",
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())
			teamID = resp.GetTeamId()

			// Create a team member (different from the owner).
			memberID = "team-edit-member"
			_, err = dbClient.User.Create().
				SetKeycloakID(memberID).
				SetUsername("team-edit-member").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			memberUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(memberID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamID,
				UserId: memberUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("allows member to edit team", func() {
			token := testutils.CreateTestJWTToken(memberID)
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

		It("denies edit for hackathon member not in team", func() {
			// Create a user who is a hackathon member (Member role) but not a team member.
			hackathonMemberID := "hackathon-member-not-in-team"
			_, err := dbClient.User.Create().
				SetKeycloakID(hackathonMemberID).
				SetUsername("hackathon-member-not-in-team").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Grant hackathon member role (not owner).
			_, err = enf.AddRole(hackathonMemberID, middleware.Member, hackathonID)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(hackathonMemberID)
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
		var hackathonID string
		var ownerID string
		var memberID string

		BeforeEach(func() {
			ownerID = "team-delete-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-delete-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Delete Test Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = hResp.GetHackathonId()

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "Delete Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())

			teamID = uuid.NewString()
			resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Delete Team",
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())
			teamID = resp.GetTeamId()

			// Create a team member (different from the owner).
			memberID = "team-delete-member"
			_, err = dbClient.User.Create().
				SetKeycloakID(memberID).
				SetUsername("team-delete-member").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			memberUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(memberID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamID,
				UserId: memberUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("does not allow member to delete team", func() {
			token := testutils.CreateTestJWTToken(memberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := teamClient.Delete(ctx, &teamMsgs.DeleteRequest{Id: teamID})
			Expect(err).To(HaveOccurred())

			_, err = dbClient.Team.Get(ctx, uuid.MustParse(teamID))
			Expect(err).NotTo(HaveOccurred())
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

		It("denies delete for hackathon member not in team", func() {
			// Create a user who is a hackathon member (Member role) but not a team member.
			hackathonMemberID := "hackathon-member-not-in-team-delete"
			_, err := dbClient.User.Create().
				SetKeycloakID(hackathonMemberID).
				SetUsername("hackathon-member-not-in-team-delete").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Grant hackathon member role (not owner).
			_, err = enf.AddRole(hackathonMemberID, middleware.Member, hackathonID)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(hackathonMemberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.Delete(ctx, &teamMsgs.DeleteRequest{Id: teamID})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))

			// Verify team still exists.
			_, err = dbClient.Team.Get(ctx, uuid.MustParse(teamID))
			Expect(err).NotTo(HaveOccurred())
		})
	})

	Describe("AssignUser", func() {
		var teamID string
		var hackathonID string
		var userID string
		var ownerID string
		var memberID string

		BeforeEach(func() {
			ownerID = "team-assign-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-assign-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Assign Test Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = hResp.GetHackathonId()

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "Assign Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())

			teamID = uuid.NewString()
			resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Assign Team",
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())
			teamID = resp.GetTeamId()

			// Create a team member (different from the owner).
			memberID = "team-assign-member"
			_, err = dbClient.User.Create().
				SetKeycloakID(memberID).
				SetUsername("team-assign-member").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			memberUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(memberID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamID,
				UserId: memberUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Create the user to assign.
			u, err := dbClient.User.Create().
				SetKeycloakID("user-to-assign").
				SetUsername("user-to-assign-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
			userID = u.ID.String()
		})

		It("does not allow member to assign user", func() {
			token := testutils.CreateTestJWTToken(memberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamID,
				UserId: userID,
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
			t, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(t.Edges.Members).To(HaveLen(1))
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

		It("denies assignment for hackathon member not in team", func() {
			// Create a user who is a hackathon member (Member role) but not a team member.
			hackathonMemberID := "hackathon-member-not-in-team-assign"
			_, err := dbClient.User.Create().
				SetKeycloakID(hackathonMemberID).
				SetUsername("hackathon-member-not-in-team-assign").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Grant hackathon member role (not owner).
			_, err = enf.AddRole(hackathonMemberID, middleware.Member, hackathonID)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(hackathonMemberID)
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
		var hackathonID string
		var userID string
		var ownerID string
		var memberID string

		BeforeEach(func() {
			ownerID = "team-remove-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-remove-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Remove Test Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = hResp.GetHackathonId()

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "Remove Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())

			teamID = uuid.NewString()
			resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Remove Team",
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())
			teamID = resp.GetTeamId()

			// Create a team member (different from the owner).
			memberID = "team-remove-member"
			_, err = dbClient.User.Create().
				SetKeycloakID(memberID).
				SetUsername("team-remove-member").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			memberUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(memberID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamID,
				UserId: memberUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Create the user to remove.
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

		It("does not allow member to remove user", func() {
			token := testutils.CreateTestJWTToken(memberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := teamClient.RemoveUser(ctx, &teamMsgs.RemoveUserRequest{
				TeamId: teamID,
				UserId: userID,
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
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

		It("denies removal for hackathon member not in team", func() {
			// Create a user who is a hackathon member (Member role) but not a team member.
			hackathonMemberID := "hackathon-member-not-in-team-remove"
			_, err := dbClient.User.Create().
				SetKeycloakID(hackathonMemberID).
				SetUsername("hackathon-member-not-in-team-remove").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Grant hackathon member role (not owner).
			_, err = enf.AddRole(hackathonMemberID, middleware.Member, hackathonID)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(hackathonMemberID)
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
		var ownerID string
		var memberID string

		BeforeEach(func() {
			ownerID = "team-submission-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-submission-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Submission Test Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			// Enable create_project_submissions capability (disabled by default)
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hResp.GetHackathonId(),
				Capabilities: []*msgs.CapabilityState{
					{
						Capability: ents.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
						Enabled:    true,
					},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "Submission Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
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

			// Create a team member (different from the owner).
			memberID = "team-submission-member"
			_, err = dbClient.User.Create().
				SetKeycloakID(memberID).
				SetUsername("team-submission-member").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			memberUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(memberID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamID,
				UserId: memberUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("allows member to create submission", func() {
			token := testutils.CreateTestJWTToken(memberID)
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

			// Verify in DB.
			s, err := dbClient.Submission.Query().
				Where(entsubmission.IDEQ(uuid.MustParse(resp.GetId()))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(s.Version).To(Equal(1))
			Expect(s.Status).To(Equal(entsubmission.StatusDraft))
		})

		It("increments version on subsequent submissions", func() {
			token := testutils.CreateTestJWTToken(memberID)
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
		var ownerID string
		var memberID string

		BeforeEach(func() {
			ownerID = "team-finalize-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-finalize-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Finalize Test Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			// Enable create_project_submissions capability (disabled by default)
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hResp.GetHackathonId(),
				Capabilities: []*msgs.CapabilityState{
					{
						Capability: ents.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
						Enabled:    true,
					},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "Finalize Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
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

			// Create a team member (different from the owner).
			memberID = "team-finalize-member"
			_, err = dbClient.User.Create().
				SetKeycloakID(memberID).
				SetUsername("team-finalize-member").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			memberUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(memberID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamID,
				UserId: memberUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())
			token = testutils.CreateTestJWTToken(memberID)
			ctx = metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

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
			token := testutils.CreateTestJWTToken(memberID)
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

	Describe("GetSubmission", func() {
		var teamID string
		var projectID string
		var hackathonID string
		var ownerID string
		var memberID string

		BeforeEach(func() {
			ownerID = "team-getsub-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-getsub-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "GetSubmission Test Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = hResp.GetHackathonId()

			// Enable create_project_submissions capability (disabled by default)
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hResp.GetHackathonId(),
				Capabilities: []*msgs.CapabilityState{
					{
						Capability: ents.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
						Enabled:    true,
					},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "GetSubmission Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())
			projectID = pResp.GetProjectId()

			teamID = uuid.NewString()
			resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "GetSubmission Team",
				ProjectId: projectID,
			})
			Expect(err).NotTo(HaveOccurred())
			teamID = resp.GetTeamId()

			// Create a team member.
			memberID = "team-getsub-member"
			_, err = dbClient.User.Create().
				SetKeycloakID(memberID).
				SetUsername("team-getsub-member").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			memberUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(memberID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamID,
				UserId: memberUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Create two submissions so we can verify "latest" is returned.
			token = testutils.CreateTestJWTToken(memberID)
			ctx = metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.CreateSubmission(ctx, &teamMsgs.CreateSubmissionRequest{
				TeamId:    teamID,
				ProjectId: projectID,
				Result:    testutils.StringPtr("https://github.com/test/repo/v1"),
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = teamClient.CreateSubmission(ctx, &teamMsgs.CreateSubmissionRequest{
				TeamId:    teamID,
				ProjectId: projectID,
				Result:    testutils.StringPtr("https://github.com/test/repo/v2"),
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("returns the latest submission for a team", func() {
			token := testutils.CreateTestJWTToken(memberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := teamClient.GetSubmission(ctx, &teamMsgs.GetSubmissionRequest{
				TeamId: teamID,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetSubmission()).NotTo(BeNil())
			Expect(resp.GetSubmission().GetVersion()).To(Equal(int32(2)))
			Expect(resp.GetSubmission().GetResult()).To(Equal("https://github.com/test/repo/v2"))
		})

		It("returns NOT_FOUND when no submission exists for team", func() {
			// Create a team without submissions.
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Empty Team Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "Empty Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())

			teamResp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Empty Team",
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())
			emptyTeamID := teamResp.GetTeamId()

			_, err = teamClient.GetSubmission(ctx, &teamMsgs.GetSubmissionRequest{
				TeamId: emptyTeamID,
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND for invalid team ID", func() {
			token := testutils.CreateTestJWTToken(memberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := teamClient.GetSubmission(ctx, &teamMsgs.GetSubmissionRequest{
				TeamId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.NotFound))
		})

		It("denies get for non-member", func() {
			nonMemberID := "non-member-getsub"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonMemberID).
				SetUsername("non-member-getsub").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonMemberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.GetSubmission(ctx, &teamMsgs.GetSubmissionRequest{
				TeamId: teamID,
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})

		It("allows owner to get submission", func() {
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := teamClient.GetSubmission(ctx, &teamMsgs.GetSubmissionRequest{
				TeamId: teamID,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetSubmission()).NotTo(BeNil())
			Expect(resp.GetSubmission().GetVersion()).To(Equal(int32(2)))
		})

		It("denies get for hackathon member not in team", func() {
			hackathonMemberID := "hackathon-member-not-in-team-getsub"
			_, err := dbClient.User.Create().
				SetKeycloakID(hackathonMemberID).
				SetUsername("hackathon-member-not-in-team-getsub").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			_, err = enf.AddRole(hackathonMemberID, middleware.Member, hackathonID)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(hackathonMemberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.GetSubmission(ctx, &teamMsgs.GetSubmissionRequest{
				TeamId: teamID,
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("ListSubmissions", func() {
		var teamID string
		var projectID string
		var hackathonID string
		var ownerID string
		var memberID string

		BeforeEach(func() {
			ownerID = "team-listsub-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("team-listsub-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "ListSubmissions Test Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = hResp.GetHackathonId()

			// Enable create_project_submissions capability (disabled by default)
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hackathonID,
				Capabilities: []*msgs.CapabilityState{
					{
						Capability: ents.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
						Enabled:    true,
					},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "ListSubmissions Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())
			projectID = pResp.GetProjectId()

			teamID = uuid.NewString()
			resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "ListSubmissions Team",
				ProjectId: projectID,
			})
			Expect(err).NotTo(HaveOccurred())
			teamID = resp.GetTeamId()

			// Create a team member.
			memberID = "team-listsub-member"
			_, err = dbClient.User.Create().
				SetKeycloakID(memberID).
				SetUsername("team-listsub-member").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			memberUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(memberID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamID,
				UserId: memberUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Create multiple submissions.
			token = testutils.CreateTestJWTToken(memberID)
			ctx = metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.CreateSubmission(ctx, &teamMsgs.CreateSubmissionRequest{
				TeamId:    teamID,
				ProjectId: projectID,
				Result:    testutils.StringPtr("https://github.com/test/repo/v1"),
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = teamClient.CreateSubmission(ctx, &teamMsgs.CreateSubmissionRequest{
				TeamId:    teamID,
				ProjectId: projectID,
				Result:    testutils.StringPtr("https://github.com/test/repo/v2"),
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = teamClient.CreateSubmission(ctx, &teamMsgs.CreateSubmissionRequest{
				TeamId:    teamID,
				ProjectId: projectID,
				Result:    testutils.StringPtr("https://github.com/test/repo/v3"),
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("lists all submissions for a team", func() {
			token := testutils.CreateTestJWTToken(memberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := teamClient.ListSubmissions(ctx, &teamMsgs.ListSubmissionsRequest{
				TeamId: teamID,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetSubmissions()).To(HaveLen(3))
		})

		It("returns empty list when no submissions exist", func() {
			// Create a team without submissions.
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Empty Team List Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "Empty List Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())

			teamResp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Empty List Team",
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())
			emptyTeamID := teamResp.GetTeamId()

			resp, err := teamClient.ListSubmissions(ctx, &teamMsgs.ListSubmissionsRequest{
				TeamId: emptyTeamID,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetSubmissions()).To(HaveLen(0))
		})

		It("returns NOT_FOUND for invalid team ID", func() {
			token := testutils.CreateTestJWTToken(memberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := teamClient.ListSubmissions(ctx, &teamMsgs.ListSubmissionsRequest{
				TeamId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.NotFound))
		})

		It("denies list for non-member", func() {
			nonMemberID := "non-member-listsub"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonMemberID).
				SetUsername("non-member-listsub").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonMemberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.ListSubmissions(ctx, &teamMsgs.ListSubmissionsRequest{
				TeamId: teamID,
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})

		It("allows owner to list submissions", func() {
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := teamClient.ListSubmissions(ctx, &teamMsgs.ListSubmissionsRequest{
				TeamId: teamID,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetSubmissions()).To(HaveLen(3))
		})

		It("denies list for hackathon member not in team", func() {
			hackathonMemberID := "hackathon-member-not-in-team-listsub"
			_, err := dbClient.User.Create().
				SetKeycloakID(hackathonMemberID).
				SetUsername("hackathon-member-not-in-team-listsub").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			_, err = enf.AddRole(hackathonMemberID, middleware.Member, hackathonID)
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(hackathonMemberID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.ListSubmissions(ctx, &teamMsgs.ListSubmissionsRequest{
				TeamId: teamID,
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("BulkAssignUsers", func() {
		var hackathonID, projectID, teamAID, teamBID string
		var ownerID, user1ID, user2ID, user3ID string
		var user1KC string

		BeforeEach(func() {
			ownerID = "bulk-assign-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("bulk-assign-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Bulk Assign Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = hResp.GetHackathonId()

			// Enable registrations (required for Join RPC).
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hackathonID,
				Capabilities: []*msgs.CapabilityState{
					{Capability: ents.Capability_CAPABILITY_REGISTER, Enabled: true},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "Bulk Assign Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())
			projectID = pResp.GetProjectId()

			// Create two teams.
			tAResp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Team A",
				ProjectId: projectID,
			})
			Expect(err).NotTo(HaveOccurred())
			teamAID = tAResp.GetTeamId()

			tBResp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Team B",
				ProjectId: projectID,
			})
			Expect(err).NotTo(HaveOccurred())
			teamBID = tBResp.GetTeamId()

			// Create and enroll participants via RPC.
			for _, uid := range []string{"bulk-user-1", "bulk-user-2", "bulk-user-3"} {
				u, err := dbClient.User.Create().
					SetKeycloakID(uid).
					SetUsername(uid + "-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())
				switch uid {
				case "bulk-user-1":
					user1ID = u.ID.String()
					user1KC = uid
				case "bulk-user-2":
					user2ID = u.ID.String()
				case "bulk-user-3":
					user3ID = u.ID.String()
				}

				// Join hackathon.
				userToken := testutils.CreateTestJWTToken(uid)
				userCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+userToken),
				)
				_, err = hackathonClient.Join(userCtx, &msgs.JoinRequest{
					HackathonId: hackathonID,
				})
				Expect(err).NotTo(HaveOccurred())

				// Approve as participant (grants Member role).
				_, err = hackathonClient.ApproveParticipant(ctx, &msgs.ApproveParticipantRequest{
					HackathonId: hackathonID,
					UserId:      u.ID.String(),
				})
				Expect(err).NotTo(HaveOccurred())
			}

			// Assign user1 to Team A already.
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamAID,
				UserId: user1ID,
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("assigns multiple users to multiple teams", func() {
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := teamClient.BulkAssignUsers(ctx, &teamMsgs.BulkAssignUsersRequest{
				HackathonId: hackathonID,
				Assignments: []*teamMsgs.BulkAssignUsersRequest_Assignment{
					{UserId: user1ID, TeamId: teamBID},
					{UserId: user2ID, TeamId: teamBID},
					{UserId: user3ID, TeamId: teamAID},
				},
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp).NotTo(BeNil())

			// Verify user1 moved from A to B.
			tA, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamAID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(tA.Edges.Members).To(HaveLen(1)) // user3

			tB, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamBID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(tB.Edges.Members).To(HaveLen(2)) // user1, user2

			// Verify casbin roles.
			role, err := enf.GetHackathonRole(user1KC, hackathonID)
			Expect(err).NotTo(HaveOccurred())
			Expect(role).To(Equal(ents.HackathonRole_HACKATHON_ROLE_MEMBER))
		})

		It("skips users already on target team", func() {
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// user1 is already on teamA, assign them again to teamA.
			resp, err := teamClient.BulkAssignUsers(ctx, &teamMsgs.BulkAssignUsersRequest{
				HackathonId: hackathonID,
				Assignments: []*teamMsgs.BulkAssignUsersRequest_Assignment{
					{UserId: user1ID, TeamId: teamAID},
					{UserId: user2ID, TeamId: teamAID},
				},
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp).NotTo(BeNil())

			tA, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamAID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(tA.Edges.Members).To(HaveLen(2))
		})

		It("denies for non-participant user", func() {
			// Create a user who is not a participant.
			nonParticipant, err := dbClient.User.Create().
				SetKeycloakID("non-participant-bulk-assign").
				SetUsername("non-participant-bulk-assign").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.BulkAssignUsers(ctx, &teamMsgs.BulkAssignUsersRequest{
				HackathonId: hackathonID,
				Assignments: []*teamMsgs.BulkAssignUsersRequest_Assignment{
					{UserId: nonParticipant.ID.String(), TeamId: teamAID},
				},
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.InvalidArgument))
		})

		It("denies for team not in hackathon", func() {
			// Create a team in a different hackathon.
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)
			now := time.Now()
			h2Resp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Other Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			p2Resp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: h2Resp.GetHackathonId(),
				Title:       "Other Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: p2Resp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())

			t2Resp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Other Team",
				ProjectId: p2Resp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = teamClient.BulkAssignUsers(ctx, &teamMsgs.BulkAssignUsersRequest{
				HackathonId: hackathonID,
				Assignments: []*teamMsgs.BulkAssignUsersRequest_Assignment{
					{UserId: user2ID, TeamId: t2Resp.GetTeamId()},
				},
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.InvalidArgument))
		})

		It("denies for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := teamClient.BulkAssignUsers(ctx, &teamMsgs.BulkAssignUsersRequest{
				HackathonId: "not-a-uuid",
				Assignments: []*teamMsgs.BulkAssignUsersRequest_Assignment{
					{UserId: user2ID, TeamId: teamAID},
				},
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.InvalidArgument))
		})

		It("denies for unauthorized user", func() {
			unauthID := "unauth-bulk-assign"
			_, err := dbClient.User.Create().
				SetKeycloakID(unauthID).
				SetUsername(unauthID).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(unauthID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.BulkAssignUsers(ctx, &teamMsgs.BulkAssignUsersRequest{
				HackathonId: hackathonID,
				Assignments: []*teamMsgs.BulkAssignUsersRequest_Assignment{
					{UserId: user2ID, TeamId: teamAID},
				},
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("BulkRemoveUsers", func() {
		var hackathonID, projectID, teamAID, teamBID string
		var ownerID, user1ID, user2ID, user3ID string

		BeforeEach(func() {
			ownerID = "bulk-remove-owner"
			_, err := dbClient.User.Create().
				SetKeycloakID(ownerID).
				SetUsername("bulk-remove-owner").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = enf.AddGlobalRole(ownerID, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			now := time.Now()
			hResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:       "Bulk Remove Hackathon",
				Visibility: ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = hResp.GetHackathonId()

			// Enable registrations (required for Join RPC).
			_, err = hackathonClient.SetCapabilities(ctx, &msgs.SetCapabilitiesRequest{
				HackathonId: hackathonID,
				Capabilities: []*msgs.CapabilityState{
					{Capability: ents.Capability_CAPABILITY_REGISTER, Enabled: true},
				},
			})
			Expect(err).NotTo(HaveOccurred())

			pResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hResp.GetHackathonId(),
				Title:       "Bulk Remove Project",
				Description: "Desc",
			})
			Expect(err).NotTo(HaveOccurred())
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: pResp.GetProjectId(),
			})
			Expect(err).NotTo(HaveOccurred())
			projectID = pResp.GetProjectId()

			// Create two teams.
			tAResp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Team A",
				ProjectId: projectID,
			})
			Expect(err).NotTo(HaveOccurred())
			teamAID = tAResp.GetTeamId()

			tBResp, err := teamClient.Create(ctx, &teamMsgs.CreateRequest{
				Name:      "Team B",
				ProjectId: projectID,
			})
			Expect(err).NotTo(HaveOccurred())
			teamBID = tBResp.GetTeamId()

			// Create and enroll participants.
			for _, uid := range []string{"bulk-rm-user-1", "bulk-rm-user-2", "bulk-rm-user-3"} {
				u, err := dbClient.User.Create().
					SetKeycloakID(uid).
					SetUsername(uid + "-username").
					Save(context.Background())
				Expect(err).NotTo(HaveOccurred())
				switch uid {
				case "bulk-rm-user-1":
					user1ID = u.ID.String()
				case "bulk-rm-user-2":
					user2ID = u.ID.String()
				case "bulk-rm-user-3":
					user3ID = u.ID.String()
				}

				// Join hackathon.
				userToken := testutils.CreateTestJWTToken(uid)
				userCtx := metadata.NewOutgoingContext(
					context.Background(),
					metadata.Pairs("authorization", "Bearer "+userToken),
				)
				_, err = hackathonClient.Join(userCtx, &msgs.JoinRequest{
					HackathonId: hackathonID,
				})
				Expect(err).NotTo(HaveOccurred())

				// Approve as participant (grants Member role).
				_, err = hackathonClient.ApproveParticipant(ctx, &msgs.ApproveParticipantRequest{
					HackathonId: hackathonID,
					UserId:      u.ID.String(),
				})
				Expect(err).NotTo(HaveOccurred())
			}

			// Assign user1 and user2 to Team A, user3 to Team B.
			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamAID,
				UserId: user1ID,
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamAID,
				UserId: user2ID,
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = teamClient.AssignUser(ctx, &teamMsgs.AssignUserRequest{
				TeamId: teamBID,
				UserId: user3ID,
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("removes multiple users from their teams", func() {
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			resp, err := teamClient.BulkRemoveUsers(ctx, &teamMsgs.BulkRemoveUsersRequest{
				HackathonId: hackathonID,
				UserIds:     []string{user1ID, user2ID, user3ID},
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp).NotTo(BeNil())

			// Verify all users removed from their teams.
			tA, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamAID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(tA.Edges.Members).To(HaveLen(0))

			tB, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamBID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(tB.Edges.Members).To(HaveLen(0))
		})

		It("silently skips users not on any team", func() {
			// user3 is on teamB, user1 and user2 on teamA.
			// Create a participant not on any team.
			unassignedUser, err := dbClient.User.Create().
				SetKeycloakID("unassigned-bulk-rm").
				SetUsername("unassigned-bulk-rm").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Create owner context for approval.
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Join hackathon.
			userToken := testutils.CreateTestJWTToken("unassigned-bulk-rm")
			userCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+userToken),
			)
			_, err = hackathonClient.Join(userCtx, &msgs.JoinRequest{
				HackathonId: hackathonID,
			})
			Expect(err).NotTo(HaveOccurred())

			// Approve as participant (grants Member role).
			_, err = hackathonClient.ApproveParticipant(ctx, &msgs.ApproveParticipantRequest{
				HackathonId: hackathonID,
				UserId:      unassignedUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Remove user1, user3 (on teams) and unassignedUser (not on team).
			resp, err := teamClient.BulkRemoveUsers(ctx, &teamMsgs.BulkRemoveUsersRequest{
				HackathonId: hackathonID,
				UserIds:     []string{user1ID, user3ID, unassignedUser.ID.String()},
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(resp).NotTo(BeNil())

			// user1 and user3 should be removed.
			tA, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamAID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(tA.Edges.Members).To(HaveLen(1)) // user2 remains

			tB, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamBID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(tB.Edges.Members).To(HaveLen(0))
		})

		It("denies for non-participant user", func() {
			nonParticipant, err := dbClient.User.Create().
				SetKeycloakID("non-participant-bulk-rm").
				SetUsername("non-participant-bulk-rm").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.BulkRemoveUsers(ctx, &teamMsgs.BulkRemoveUsersRequest{
				HackathonId: hackathonID,
				UserIds:     []string{user1ID, nonParticipant.ID.String()},
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.InvalidArgument))

			// Nothing should have changed.
			tA, err := dbClient.Team.Query().
				Where(entteam.IDEQ(uuid.MustParse(teamAID))).
				WithMembers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(tA.Edges.Members).To(HaveLen(2))
		})

		It("denies for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(ownerID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := teamClient.BulkRemoveUsers(ctx, &teamMsgs.BulkRemoveUsersRequest{
				HackathonId: "not-a-uuid",
				UserIds:     []string{user1ID},
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.InvalidArgument))
		})

		It("denies for unauthorized user", func() {
			unauthID := "unauth-bulk-rm"
			_, err := dbClient.User.Create().
				SetKeycloakID(unauthID).
				SetUsername(unauthID).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(unauthID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = teamClient.BulkRemoveUsers(ctx, &teamMsgs.BulkRemoveUsersRequest{
				HackathonId: hackathonID,
				UserIds:     []string{user1ID},
			})
			Expect(err).To(HaveOccurred())
			Expect(status.Code(err)).To(Equal(codes.PermissionDenied))
		})
	})
})
