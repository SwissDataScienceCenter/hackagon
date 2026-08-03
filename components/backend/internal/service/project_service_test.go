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
	entproject "github.com/swissdatasciencecenter/hackagon/components/backend/ent/project"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	projectMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/project_svc"
	trackMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/track_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("ProjectService", func() {

	var (
		dbClient        *ent.Client
		conn            *grpc.ClientConn
		projectClient   hackathonSvc.ProjectServiceClient
		hackathonClient hackathonSvc.HackathonServiceClient
		testAdmin       string
	)

	BeforeEach(func() {
		dbClient, conn, _ = testutils.CreateTestServer()
		testAdmin = testutils.TestAdminKeycloakID

		projectClient = hackathonSvc.NewProjectServiceClient(conn)
		hackathonClient = hackathonSvc.NewHackathonServiceClient(conn)
	})

	Describe("Propose", func() {

		It("creates project successfully with admin token and no track", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First create a hackathon to associate the project with
			now := time.Now()
			hackathonResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(hackathonResp.GetHackathonId()).NotTo(BeEmpty())

			title := "Test Project"
			description := "Test project description"
			image := "https://example.com/image.png"
			req := &projectMsgs.ProposeRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Title:       title,
				Description: description,
				Image:       &image,
			}

			resp, err := projectClient.Propose(ctx, req)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetProjectId()).NotTo(BeEmpty())

			// Verify in database
			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(resp.GetProjectId()))).
				WithCreator().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Title).To(Equal(title))
			Expect(p.Description).To(Equal(description))
			Expect(p.Image).To(Equal(image))
			Expect(p.Status).To(Equal(entproject.StatusProposed))
			Expect(p.Edges.Creator.KeycloakID).To(Equal(testAdmin))
			Expect(p.Edges.Creator.KeycloakID).To(Equal(testAdmin))
			Expect(p.Edges.Track).To(BeNil(), "track should be nil when not provided")
		})

		It("creates project with optional track when provided", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First create a hackathon
			now := time.Now()
			hackathonResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			// Create a track
			trackName := "Backend Track"
			trackDesc := "Track for backend projects"
			trackResp, err := hackathonSvc.NewTrackServiceClient(conn).
				Create(ctx, &trackMsgs.CreateRequest{
					HackathonId: hackathonResp.GetHackathonId(),
					Name:        trackName,
					Description: trackDesc,
				})
			Expect(err).NotTo(HaveOccurred())

			// Create project with track
			trackID := trackResp.GetTrackId()
			req := &projectMsgs.ProposeRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Title:       "Test Project",
				Description: "Test description",
				TrackId:     &trackID,
			}

			resp, err := projectClient.Propose(ctx, req)
			Expect(err).NotTo(HaveOccurred())

			// Verify track is set
			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(resp.GetProjectId()))).
				WithTrack().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Edges.Track).NotTo(BeNil())
			Expect(p.Edges.Track.Name).To(Equal(trackName))
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			req := &projectMsgs.ProposeRequest{
				HackathonId: uuid.NewString(),
				Title:       "Test Project",
				Description: "Test description",
			}

			_, err := projectClient.Propose(ctx, req)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns NOT_FOUND for invalid track ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			hackathonResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			req := &projectMsgs.ProposeRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Title:       "Test Project",
				Description: "Test description",
				TrackId:     testutils.StringPtr(uuid.NewString()),
			}

			_, err = projectClient.Propose(ctx, req)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns INVALID_ARGUMENT for track belonging to different hackathon", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create two hackathons
			now := time.Now()
			hackathon1Resp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Hackathon 1",
				Description: testutils.StringPtr("First hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			hackathon2Resp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Hackathon 2",
				Description: testutils.StringPtr("Second hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(72 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(96 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			// Create track in hackathon 2
			trackResp, err := hackathonSvc.NewTrackServiceClient(conn).
				Create(ctx, &trackMsgs.CreateRequest{
					HackathonId: hackathon2Resp.GetHackathonId(),
					Name:        "Track for Hackathon 2",
					Description: "Track description",
				})
			Expect(err).NotTo(HaveOccurred())

			// Try to create project in hackathon 1 with track from hackathon 2
			trackID := trackResp.GetTrackId()
			req := &projectMsgs.ProposeRequest{
				HackathonId: hackathon1Resp.GetHackathonId(),
				Title:       "Test Project",
				Description: "Test description",
				TrackId:     &trackID,
			}

			_, err = projectClient.Propose(ctx, req)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.InvalidArgument))
		})

		It("allows hackathon member to propose", func() {
			// Create a test user
			memberKeycloakID := "member-project-proposer"
			_, err := dbClient.User.Create().
				SetKeycloakID(memberKeycloakID).
				SetUsername("member-project-proposer").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Create hackathon as admin
			adminToken := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+adminToken),
			)

			now := time.Now()
			hackathonResp, err := hackathonClient.Create(adminCtx, &msgs.CreateRequest{
				Name:        "Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID := hackathonResp.GetHackathonId()

			// Enable registrations (disabled by default)
			_, err = hackathonClient.EditSettings(adminCtx, &msgs.EditSettingsRequest{
				HackathonId:          hackathonID,
				RegistrationsEnabled: testutils.BoolPtr(true),
			})
			Expect(err).NotTo(HaveOccurred())

			// Join the hackathon as the member (creates waitlisted participant)
			memberToken := testutils.CreateTestJWTToken(memberKeycloakID)
			memberCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+memberToken),
			)
			_, err = hackathonClient.Join(memberCtx, &msgs.JoinRequest{
				HackathonId: hackathonID,
			})
			Expect(err).NotTo(HaveOccurred())

			// Look up the user entity ID
			memberUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(memberKeycloakID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Approve the participant as admin
			_, err = hackathonClient.ApproveParticipant(adminCtx, &msgs.ApproveParticipantRequest{
				HackathonId: hackathonID,
				UserId:      memberUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Propose as approved member
			title := "Member Proposed Project"
			req := &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       title,
				Description: "Proposed by a member",
			}

			resp, err := projectClient.Propose(memberCtx, req)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetProjectId()).NotTo(BeEmpty())

			// Verify in database
			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(resp.GetProjectId()))).
				WithCreator().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Title).To(Equal(title))
			Expect(p.Status).To(Equal(entproject.StatusProposed))
			Expect(p.Edges.Creator.KeycloakID).To(Equal(memberKeycloakID))
		})

		It("allows a waitlisted participant to propose", func() {
			// Create a test user
			waitlistedKeycloakID := "waitlisted-project-proposer"
			_, err := dbClient.User.Create().
				SetKeycloakID(waitlistedKeycloakID).
				SetUsername("waitlisted-project-proposer").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Create hackathon as admin
			adminToken := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+adminToken),
			)

			now := time.Now()
			hackathonResp, err := hackathonClient.Create(adminCtx, &msgs.CreateRequest{
				Name:        "Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID := hackathonResp.GetHackathonId()

			// Enable registrations (disabled by default)
			_, err = hackathonClient.EditSettings(adminCtx, &msgs.EditSettingsRequest{
				HackathonId:          hackathonID,
				RegistrationsEnabled: testutils.BoolPtr(true),
			})
			Expect(err).NotTo(HaveOccurred())

			// Join the hackathon as the waitlisted user (creates is_waiting=true participant)
			waitlistedToken := testutils.CreateTestJWTToken(waitlistedKeycloakID)
			waitlistedCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+waitlistedToken),
			)
			_, err = hackathonClient.Join(waitlistedCtx, &msgs.JoinRequest{
				HackathonId: hackathonID,
			})
			Expect(err).NotTo(HaveOccurred())

			// Waitlisted participants MAY propose: joining grants the Member
			// role; is_waiting only gates the sensitive paths (member view,
			// voting). Policy pinned by the lifecycle recipe (act 3).
			req := &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       "Waitlisted Project",
				Description: "Allowed while still on the waitlist",
			}

			resp, err := projectClient.Propose(waitlistedCtx, req)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetProjectId()).NotTo(BeEmpty())
		})

		It("requires Propose permission to propose", func() {
			// Create a non-admin test user
			nonAdminKeycloakID := "non-admin-project"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("test-project-user").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create hackathon as admin first
			adminToken := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+adminToken),
			)

			now := time.Now()
			hackathonResp, err := hackathonClient.Create(adminCtx, &msgs.CreateRequest{
				Name:        "Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			req := &projectMsgs.ProposeRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Title:       "Unauthorized Project",
				Description: "Unauthorized description",
			}

			_, err = projectClient.Propose(ctx, req)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("List", func() {
		var createdProjectID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "List Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a project
			title := "Test Project"
			description := "Test project description"
			projectResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       title,
				Description: description,
			})
			Expect(err).NotTo(HaveOccurred())
			createdProjectID = projectResp.GetProjectId()
		})

		It("lists all projects for a hackathon", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := projectClient.List(
				ctx,
				&projectMsgs.ListRequest{HackathonId: hackathonID},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(listResp.GetProjects()).To(HaveLen(1))
			Expect(listResp.GetProjects()[0].GetId()).To(Equal(createdProjectID))
			Expect(listResp.GetProjects()[0].GetTitle()).To(Equal("Test Project"))
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := projectClient.List(
				ctx,
				&projectMsgs.ListRequest{HackathonId: uuid.NewString()},
			)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns projects with creator info", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := projectClient.List(
				ctx,
				&projectMsgs.ListRequest{HackathonId: hackathonID},
			)
			Expect(err).NotTo(HaveOccurred())
			Expect(len(listResp.GetProjects())).To(Equal(1))
			project := listResp.GetProjects()[0]
			Expect(project.CreatorId).NotTo(BeEmpty())
		})
	})

	Describe("Get", func() {
		var createdProjectID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Get Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a project
			title := "Get Test Project"
			description := "Test project description"
			projectResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       title,
				Description: description,
			})
			Expect(err).NotTo(HaveOccurred())
			createdProjectID = projectResp.GetProjectId()
		})

		It("retrieves project with full details", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getReq := &projectMsgs.GetRequest{ProjectId: createdProjectID}
			getResp, err := projectClient.Get(ctx, getReq)
			Expect(err).NotTo(HaveOccurred())

			p := getResp.GetProject()
			Expect(p.GetId()).To(Equal(createdProjectID))
			Expect(p.GetTitle()).To(Equal("Get Test Project"))
			Expect(p.GetDescription()).To(Equal("Test project description"))
			Expect(p.GetHackathonId()).To(Equal(hackathonID))
			Expect(p.Status).To(Equal(ents.ProjectStatus_PROJECT_STATUS_PROPOSED))
		})

		It("returns NOT_FOUND for invalid project ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getReq := &projectMsgs.GetRequest{ProjectId: uuid.NewString()}
			_, err := projectClient.Get(ctx, getReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Read permission to get", func() {
			// Use a user who is not an owner/organizer
			nonOwnerKeycloakID := "non-owner-project"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-project-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getReq := &projectMsgs.GetRequest{ProjectId: createdProjectID}
			_, err = projectClient.Get(ctx, getReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Approve", func() {
		var createdProjectID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Approve Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a project
			projectResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       "Test Project",
				Description: "Test description",
			})
			Expect(err).NotTo(HaveOccurred())
			createdProjectID = projectResp.GetProjectId()

			// Verify initial status is proposed
			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(createdProjectID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Status).To(Equal(entproject.StatusProposed))
		})

		It("approves project with admin token", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			approveReq := &projectMsgs.ApproveRequest{
				ProjectId: createdProjectID,
			}

			_, err := projectClient.Approve(ctx, approveReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify status changed to approved
			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(createdProjectID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Status).To(Equal(entproject.StatusApproved))
		})

		It("returns NOT_FOUND for invalid project ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			approveReq := &projectMsgs.ApproveRequest{
				ProjectId: uuid.NewString(),
			}

			_, err := projectClient.Approve(ctx, approveReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission to approve", func() {
			// Use a user who is not an owner/organizer
			nonAdminKeycloakID := "non-admin-approve"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("test-approve-user").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			approveReq := &projectMsgs.ApproveRequest{
				ProjectId: createdProjectID,
			}

			_, err = projectClient.Approve(ctx, approveReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("SetPreference", func() {
		var createdProjectID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Preference Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a project
			projectResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       "Test Project",
				Description: "Test description",
			})
			Expect(err).NotTo(HaveOccurred())
			createdProjectID = projectResp.GetProjectId()

			// Create a test user who will be added as participant
			testUser, err := dbClient.User.Create().
				SetKeycloakID("test-preference-user").
				SetUsername("test-preference-username").
				SetDisplayName("Test User").
				SetEmail("test@preference.dev").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Add test user as participant (not waitlisted)
			now = time.Now()
			_, err = dbClient.Participant.Create().
				SetHackathonID(uuid.MustParse(hackathonID)).
				SetUserID(testUser.ID).
				SetIsWaiting(false).
				SetCreatedAt(now).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())
		})

		It("sets preference for participating user", func() {
			token := testutils.CreateTestJWTToken("test-preference-user")
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			setReq := &projectMsgs.SetPreferenceRequest{
				ProjectId: createdProjectID,
			}

			_, err := projectClient.SetPreference(ctx, setReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify user is in preferred_by_users edge
			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(createdProjectID))).
				WithPreferredByUsers().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Edges.PreferredByUsers).To(HaveLen(1))
			Expect(p.Edges.PreferredByUsers[0].KeycloakID).To(Equal("test-preference-user"))
		})

		It("returns NOT_FOUND for invalid project ID", func() {
			token := testutils.CreateTestJWTToken("non-participant-user")
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			setReq := &projectMsgs.SetPreferenceRequest{
				ProjectId: uuid.NewString(),
			}

			_, err := projectClient.SetPreference(ctx, setReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns PERMISSION_DENIED for non-participants", func() {
			// Use a different user who is not a participant
			nonParticipantID := "non-participant-user"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonParticipantID).
				SetUsername("non-participant-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonParticipantID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			setReq := &projectMsgs.SetPreferenceRequest{
				ProjectId: createdProjectID,
			}

			_, err = projectClient.SetPreference(ctx, setReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})

		It("returns PERMISSION_DENIED for waitlisted users", func() {
			// Create waitlisted user
			waitlistedUser, err := dbClient.User.Create().
				SetKeycloakID("waitlisted-user").
				SetUsername("waitlisted-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Add as waitlisted participant
			now := time.Now()
			_, err = dbClient.Participant.Create().
				SetHackathonID(uuid.MustParse(hackathonID)).
				SetUserID(waitlistedUser.ID).
				SetIsWaiting(true).
				SetCreatedAt(now).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken("waitlisted-user")
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			setReq := &projectMsgs.SetPreferenceRequest{
				ProjectId: createdProjectID,
			}

			_, err = projectClient.SetPreference(ctx, setReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("ExportPreferences", func() {
		var hackathonID string
		var project1ID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Export Preferences Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create two projects
			project1Resp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       "Project One",
				Description: "First project",
			})
			Expect(err).NotTo(HaveOccurred())
			project1ID = project1Resp.GetProjectId()

			_, err = projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       "Project Two",
				Description: "Second project",
			})
			Expect(err).NotTo(HaveOccurred())

			// Create a test user
			testUser, err := dbClient.User.Create().
				SetKeycloakID("test-export-user").
				SetUsername("test-export-username").
				SetDisplayName("Test User").
				SetEmail("test@export.dev").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Add test user as participant
			now = time.Now()
			_, err = dbClient.Participant.Create().
				SetHackathonID(uuid.MustParse(hackathonID)).
				SetUserID(testUser.ID).
				SetIsWaiting(false).
				SetCreatedAt(now).
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Set preference for project 1
			prefCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs(
					"authorization",
					"Bearer "+testutils.CreateTestJWTToken("test-export-user"),
				),
			)
			_, err = projectClient.SetPreference(prefCtx, &projectMsgs.SetPreferenceRequest{
				ProjectId: project1ID,
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("exports all projects with preferences for admin", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			exportReq := &projectMsgs.ExportPreferencesRequest{
				HackathonId: hackathonID,
			}

			exportResp, err := projectClient.ExportPreferences(ctx, exportReq)
			Expect(err).NotTo(HaveOccurred())
			Expect(exportResp.GetProjects()).To(HaveLen(2))

			// Check project 1 has preference
			project1 := exportResp.GetProjects()[0]
			if project1.GetId() == project1ID {
				Expect(project1.Preferences).To(HaveLen(1))
				Expect(project1.Preferences[0].GetId()).NotTo(BeEmpty())
			} else {
				// Project 2 should have no preferences
				Expect(project1.Preferences).To(BeEmpty())
			}
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			exportReq := &projectMsgs.ExportPreferencesRequest{
				HackathonId: uuid.NewString(),
			}

			_, err := projectClient.ExportPreferences(ctx, exportReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission to export", func() {
			// Use a user who is not an owner/organizer
			nonAdminKeycloakID := "non-admin-export"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("test-export-user2").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			exportReq := &projectMsgs.ExportPreferencesRequest{
				HackathonId: hackathonID,
			}

			_, err = projectClient.ExportPreferences(ctx, exportReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Edit", func() {
		var createdProjectID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Edit Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a project
			title := "Original Project Title"
			description := "Original description"
			image := "https://example.com/original.png"
			projectResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       title,
				Description: description,
				Image:       &image,
			})
			Expect(err).NotTo(HaveOccurred())
			createdProjectID = projectResp.GetProjectId()
		})

		It("allows owner to edit project", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			newTitle := "Updated Title"
			newDesc := testutils.StringPtr("Updated description")

			editReq := &projectMsgs.EditRequest{
				ProjectId:   createdProjectID,
				Title:       &newTitle,
				Description: newDesc,
			}

			_, err := projectClient.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify in database
			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(createdProjectID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Title).To(Equal(newTitle))
			Expect(p.Description).To(Equal(*newDesc))
		})

		It("allows creator to edit their own project", func() {
			// Create a new user who will be the project creator
			creatorID := "project-creator-user"
			_, err := dbClient.User.Create().
				SetKeycloakID(creatorID).
				SetUsername("creator-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Enable registrations (disabled by default)
			adminToken := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+adminToken),
			)
			_, err = hackathonClient.EditSettings(adminCtx, &msgs.EditSettingsRequest{
				HackathonId:          hackathonID,
				RegistrationsEnabled: testutils.BoolPtr(true),
			})
			Expect(err).NotTo(HaveOccurred())

			// Creator joins the hackathon (creates waitlisted participant)
			creatorToken := testutils.CreateTestJWTToken(creatorID)
			creatorCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+creatorToken),
			)
			_, err = hackathonClient.Join(creatorCtx, &msgs.JoinRequest{
				HackathonId: hackathonID,
			})
			Expect(err).NotTo(HaveOccurred())

			// Approve the participant as admin
			creatorUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(creatorID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = hackathonClient.ApproveParticipant(adminCtx, &msgs.ApproveParticipantRequest{
				HackathonId: hackathonID,
				UserId:      creatorUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Creator proposes the project via the gRPC endpoint
			creatorProjectResp, err := projectClient.Propose(
				creatorCtx,
				&projectMsgs.ProposeRequest{
					HackathonId: hackathonID,
					Title:       "Creator's Project",
					Description: "Creator's description",
				},
			)
			Expect(err).NotTo(HaveOccurred())
			creatorProjectID := creatorProjectResp.GetProjectId()

			// Creator edits their own project
			newTitle := "Updated by Creator"
			editReq := &projectMsgs.EditRequest{
				ProjectId: creatorProjectID,
				Title:     &newTitle,
			}

			_, err = projectClient.Edit(creatorCtx, editReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify update
			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(creatorProjectID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Title).To(Equal(newTitle))
		})

		It("allows partial updates", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Only update title, keep other fields
			newTitle := "Partially Updated"
			editReq := &projectMsgs.EditRequest{
				ProjectId: createdProjectID,
				Title:     &newTitle,
			}

			_, err := projectClient.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())

			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(createdProjectID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Title).To(Equal(newTitle))
			Expect(p.Description).To(Equal("Original description"))
		})

		It("allows adding track to existing project", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create a track
			trackResp, err := hackathonSvc.NewTrackServiceClient(conn).
				Create(ctx, &trackMsgs.CreateRequest{
					HackathonId: hackathonID,
					Name:        "Backend Track",
					Description: "Track for backend projects",
				})
			Expect(err).NotTo(HaveOccurred())

			// Update project to add track
			trackID := trackResp.GetTrackId()
			editReq := &projectMsgs.EditRequest{
				ProjectId: createdProjectID,
				TrackId:   &trackID,
			}

			_, err = projectClient.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify track is set
			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(createdProjectID))).
				WithTrack().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Edges.Track).NotTo(BeNil())
			Expect(p.Edges.Track.Name).To(Equal("Backend Track"))
		})

		It("returns NOT_FOUND for invalid project ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			editReq := &projectMsgs.EditRequest{
				ProjectId: uuid.NewString(),
				Title:     testutils.StringPtr("Should fail"),
			}

			_, err := projectClient.Edit(ctx, editReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("returns PERMISSION_DENIED for non-owners and non-creators", func() {
			// Use a user who is neither owner nor creator
			nonAdminKeycloakID := "non-admin-edit"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("non-admin-edit-user").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			editReq := &projectMsgs.EditRequest{
				ProjectId: createdProjectID,
				Title:     testutils.StringPtr("Unauthorized edit"),
			}

			_, err = projectClient.Edit(ctx, editReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Disapprove", func() {
		var createdProjectID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Disapprove Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a project and approve it
			projectResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       "Disapprove Test Project",
				Description: "Project to be disapproved",
			})
			Expect(err).NotTo(HaveOccurred())
			createdProjectID = projectResp.GetProjectId()

			// Approve the project
			_, err = projectClient.Approve(ctx, &projectMsgs.ApproveRequest{
				ProjectId: createdProjectID,
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("allows owner to disapprove a project", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := projectClient.Disapprove(ctx, &projectMsgs.DisapproveRequest{
				ProjectId: createdProjectID,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify status is back to proposed
			p, err := dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(createdProjectID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(p.Status).To(Equal(entproject.StatusProposed))
		})

		It("returns NOT_FOUND for invalid project ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := projectClient.Disapprove(ctx, &projectMsgs.DisapproveRequest{
				ProjectId: uuid.NewString(),
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission to disapprove", func() {
			// Use a user who is not an owner/organizer
			nonAdminKeycloakID := "non-admin-disapprove"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("non-admin-disapprove-user").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err = projectClient.Disapprove(ctx, &projectMsgs.DisapproveRequest{
				ProjectId: createdProjectID,
			})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Delete", func() {
		var createdProjectID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &msgs.CreateRequest{
				Name:        "Delete Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a project
			projectResp, err := projectClient.Propose(ctx, &projectMsgs.ProposeRequest{
				HackathonId: hackathonID,
				Title:       "Delete Test Project",
				Description: "Project to be deleted",
			})
			Expect(err).NotTo(HaveOccurred())
			createdProjectID = projectResp.GetProjectId()
		})

		It("allows owner to delete project", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			deleteReq := &projectMsgs.DeleteRequest{
				ProjectId: createdProjectID,
			}

			_, err := projectClient.Delete(ctx, deleteReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify project was deleted
			_, err = dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(createdProjectID))).
				Only(context.Background())
			Expect(err).To(HaveOccurred())
			Expect(ent.IsNotFound(err)).To(BeTrue())
		})

		It("allows creator to delete their project", func() {
			// Create a user who will be the project creator
			creatorID := "project-deleter-user"
			_, err := dbClient.User.Create().
				SetKeycloakID(creatorID).
				SetUsername("deleter-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			// Enable registrations (disabled by default)
			adminToken := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+adminToken),
			)
			_, err = hackathonClient.EditSettings(adminCtx, &msgs.EditSettingsRequest{
				HackathonId:          hackathonID,
				RegistrationsEnabled: testutils.BoolPtr(true),
			})
			Expect(err).NotTo(HaveOccurred())

			// Creator joins the hackathon (creates waitlisted participant)
			creatorToken := testutils.CreateTestJWTToken(creatorID)
			creatorCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+creatorToken),
			)
			_, err = hackathonClient.Join(creatorCtx, &msgs.JoinRequest{
				HackathonId: hackathonID,
			})
			Expect(err).NotTo(HaveOccurred())

			// Approve the participant as admin
			creatorUser, err := dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(creatorID)).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			_, err = hackathonClient.ApproveParticipant(adminCtx, &msgs.ApproveParticipantRequest{
				HackathonId: hackathonID,
				UserId:      creatorUser.ID.String(),
			})
			Expect(err).NotTo(HaveOccurred())

			// Creator proposes the project via the gRPC endpoint
			creatorProjectResp, err := projectClient.Propose(
				creatorCtx,
				&projectMsgs.ProposeRequest{
					HackathonId: hackathonID,
					Title:       "Creator's Deletable Project",
					Description: "Creator's description",
				},
			)
			Expect(err).NotTo(HaveOccurred())
			creatorProjectID := creatorProjectResp.GetProjectId()

			// Creator deletes their own project
			deleteReq := &projectMsgs.DeleteRequest{
				ProjectId: creatorProjectID,
			}

			_, err = projectClient.Delete(creatorCtx, deleteReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify project was deleted
			_, err = dbClient.Project.Query().
				Where(entproject.IDEQ(uuid.MustParse(creatorProjectID))).
				Only(context.Background())
			Expect(err).To(HaveOccurred())
			Expect(ent.IsNotFound(err)).To(BeTrue())
		})

		It("returns NOT_FOUND for invalid project ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			deleteReq := &projectMsgs.DeleteRequest{
				ProjectId: uuid.NewString(),
			}

			_, err := projectClient.Delete(ctx, deleteReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission to delete", func() {
			// Use a user who is not an owner/organizer
			nonAdminKeycloakID := "non-admin-delete"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("non-admin-delete-user").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			deleteReq := &projectMsgs.DeleteRequest{
				ProjectId: createdProjectID,
			}

			_, err = projectClient.Delete(ctx, deleteReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

})
