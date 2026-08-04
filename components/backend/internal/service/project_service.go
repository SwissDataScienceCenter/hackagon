package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entproject "github.com/swissdatasciencecenter/hackagon/components/backend/ent/project"
	enttrack "github.com/swissdatasciencecenter/hackagon/components/backend/ent/track"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/capability"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/project_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type ProjectService struct {
	hackathon.UnimplementedProjectServiceServer
	dbClient *ent.Client
	enforcer *mw.Enforcer
}

func NewProjectService(dbClient *ent.Client, enf *mw.Enforcer) *ProjectService {
	return &ProjectService{
		UnimplementedProjectServiceServer: hackathon.UnimplementedProjectServiceServer{},
		dbClient:                          dbClient,
		enforcer:                          enf,
	}
}

func (s *ProjectService) List(
	ctx context.Context,
	req *msgs.ListRequest,
) (*msgs.ListResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Project.Read permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Project, mw.Read); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	_, err = s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(hackathonID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Query projects
	projects, err := s.dbClient.Project.Query().
		Where(entproject.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		WithCreator().
		WithModifier().
		WithTrack().
		All(ctx)
	if err != nil {
		slog.Error("query projects", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	entries := make([]*ents.Project, 0, len(projects))
	for _, p := range projects {
		entries = append(entries, projectEntryFromEnt(p, hackathonID))
	}

	return &msgs.ListResponse{Projects: entries}, nil
}

func (s *ProjectService) Get(
	ctx context.Context,
	req *msgs.GetRequest,
) (*msgs.GetResponse, error) {
	projectID, err := uuid.Parse(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// Get the project to find its hackathon_id
	project, err := s.dbClient.Project.Query().
		Where(entproject.IDEQ(projectID)).
		WithCreator().
		WithModifier().
		WithTrack().
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "project %s not found", req.GetProjectId())
		}
		slog.Error("query project", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := project.Edges.Hackathon.ID

	// Check Project.Read permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Project, mw.Read); err != nil {
		return nil, err
	}

	return &msgs.GetResponse{Project: projectEntryFromEnt(project, hackathonID)}, nil
}

func (s *ProjectService) Propose(
	ctx context.Context,
	req *msgs.ProposeRequest,
) (*msgs.ProposeResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Project.Propose permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Project, mw.Propose); err != nil {
		return nil, err
	}

	if err := requireCapability(
		ctx, s.dbClient, s.enforcer, hackathonID, capability.ProposeProjects,
	); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	_, err = s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(hackathonID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Ensure user exists and get their entity ID
	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Determine the track (if provided)
	var track *ent.Track
	if req.GetTrackId() != "" { //nolint:nestif // this is not actually complex...
		trackID, err := uuid.Parse(req.GetTrackId())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid track_id: %v", err)
		}
		track, err = s.dbClient.Track.Query().
			Where(enttrack.IDEQ(trackID)).
			WithHackathon().
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, status.Errorf(codes.NotFound, "track %s not found", req.GetTrackId())
			}
			slog.Error("query track", "err", err)

			return nil, status.Error(codes.Internal, "couldn't query database")
		}
		// Verify track belongs to the same hackathon
		if track.Edges.Hackathon.ID != hackathonID {
			return nil, status.Errorf(
				codes.InvalidArgument,
				"track %s does not belong to hackathon %s",
				req.GetTrackId(),
				hackathonID,
			)
		}
	}

	// Build the project create query
	create := s.dbClient.Project.Create().
		SetHackathonID(hackathonID).
		SetTitle(req.GetTitle()).
		SetDescription(req.GetDescription()).
		SetStatus("proposed").
		SetImage(req.GetImage()).
		SetCreator(user).
		SetModifier(user)

	// Set track only if provided
	if track != nil {
		create = create.SetTrack(track)
	}

	// Create the project with status "proposed"
	p, err := create.Save(ctx)
	if err != nil {
		slog.Error("create project", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't create project in database")
	}

	if _, err = s.enforcer.AddRole(uid, mw.Owner, hackathonID.String(), mw.WithProject(p.ID.String())); err != nil {
		return nil, status.Errorf(codes.Internal, "couldn't add project owner permission: %v", err)
	}

	return &msgs.ProposeResponse{ProjectId: p.ID.String()}, nil
}

func (s *ProjectService) Approve(
	ctx context.Context,
	req *msgs.ApproveRequest,
) (*msgs.ApproveResponse, error) {
	err := s.setApproval(ctx, req.GetProjectId(), "approved")
	if err != nil {
		return nil, err
	}
	return &msgs.ApproveResponse{}, nil
}

func (s *ProjectService) Disapprove(
	ctx context.Context,
	req *msgs.DisapproveRequest,
) (*msgs.DisapproveResponse, error) {
	err := s.setApproval(ctx, req.GetProjectId(), "proposed")
	if err != nil {
		return nil, err
	}
	return &msgs.DisapproveResponse{}, nil
}

func (s *ProjectService) setApproval(
	ctx context.Context,
	projectId string,
	projectStatus entproject.Status,
) error {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return err
	}

	projectID, err := uuid.Parse(projectId)
	if err != nil {
		return status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// Get the project to find its hackathon_id
	project, err := s.dbClient.Project.Query().
		Where(entproject.IDEQ(projectID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return status.Errorf(codes.NotFound, "project %s not found", projectId)
		}
		slog.Error("query project", "err", err)

		return status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := project.Edges.Hackathon.ID

	// Check Project.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Project, mw.Write); err != nil {
		return err
	}

	// Update the project status to "proposed"
	_, err = s.dbClient.Project.Update().
		Where(entproject.IDEQ(projectID)).
		SetStatus(projectStatus).
		Save(ctx)
	if err != nil {
		slog.Error("update project status", "err", err)

		return status.Errorf(codes.Internal, "couldn't update project status")
	}

	return nil
}

func (s *ProjectService) SetPreference(
	ctx context.Context,
	req *msgs.SetPreferenceRequest,
) (*msgs.SetPreferenceResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// Get the project to find its hackathon_id
	project, err := s.dbClient.Project.Query().
		Where(entproject.IDEQ(projectID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "project %s not found", req.GetProjectId())
		}
		slog.Error("query project", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := project.Edges.Hackathon.ID

	if err := requireCapability(
		ctx, s.dbClient, s.enforcer, hackathonID, capability.SetTeamPreferences,
	); err != nil {
		return nil, err
	}

	// Verify user is a participant in the hackathon
	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Check if user is a participant in the hackathon. Waitlisted counts:
	// preferences are expressed before the roster cut so team formation can
	// consider the whole list — same policy family as waitlisted-may-propose.
	if _, err := s.dbClient.Participant.Query().
		Where(
			entparticipant.HackathonIDEQ(hackathonID),
			entparticipant.UserID(user.ID),
		).Only(ctx); err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.PermissionDenied,
				"user is not a participant in hackathon %s",
				hackathonID,
			)
		}
		slog.Error("query participant", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query participant")
	}

	// Add the user's preference to the project (edge relation)
	_, err = project.Update().
		AddPreferredByUsers(user).
		Save(ctx)
	if err != nil {
		slog.Error("add project preference", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't set project preference")
	}

	return &msgs.SetPreferenceResponse{ProjectId: projectID.String()}, nil
}

func (s *ProjectService) ExportPreferences(
	ctx context.Context,
	req *msgs.ExportPreferencesRequest,
) (*msgs.ExportPreferencesResponse, error) {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Project.Write permission (organizers need Write access)
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Project, mw.Write); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	_, err = s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(hackathonID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Query all projects in the hackathon with their preferences
	projects, err := s.dbClient.Project.Query().
		Where(entproject.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		WithCreator().
		WithModifier().
		WithTrack().
		WithPreferredByUsers().
		All(ctx)
	if err != nil {
		slog.Error("query projects with preferences", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	entries := make([]*ents.ProjectWithPreferences, 0, len(projects))
	for _, p := range projects {
		entries = append(entries, projectWithPreferencesEntryFromEnt(p, hackathonID))
	}

	return &msgs.ExportPreferencesResponse{Projects: entries}, nil
}

func (s *ProjectService) Edit(
	ctx context.Context,
	req *msgs.EditRequest,
) (*msgs.EditResponse, error) {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// Get the project to find its hackathon_id
	project, err := s.dbClient.Project.Query().
		Where(entproject.IDEQ(projectID)).
		WithHackathon().
		WithCreator().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "project %s not found", req.GetProjectId())
		}
		slog.Error("query project", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := project.Edges.Hackathon.ID

	err = s.enforcer.RequirePermission(
		ctx,
		hackathonID.String(),
		mw.Project,
		mw.Write,
		mw.WithProject(projectID.String()),
	)
	if err != nil {
		err = s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Project, mw.Write)
		if err != nil {
			return nil, status.Error(codes.PermissionDenied, "permission denied")
		}
	}

	// Build the update query with only provided fields
	update := s.dbClient.Project.Update().
		Where(entproject.IDEQ(projectID))

	if req.Title != nil {
		update = update.SetTitle(req.GetTitle())
	}
	if req.Description != nil {
		update = update.SetDescription(req.GetDescription())
	}
	if req.GetTrackId() != "" { //nolint:nestif // this is not actually complex...
		trackID, err := uuid.Parse(req.GetTrackId())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid track_id: %v", err)
		}
		track, err := s.dbClient.Track.Query().
			Where(enttrack.IDEQ(trackID)).
			WithHackathon().
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, status.Errorf(codes.NotFound, "track %s not found", req.GetTrackId())
			}
			slog.Error("query track", "err", err)

			return nil, status.Error(codes.Internal, "couldn't query database")
		}
		// Verify track belongs to the same hackathon
		if track.Edges.Hackathon.ID != hackathonID {
			return nil, status.Errorf(
				codes.InvalidArgument,
				"track %s does not belong to hackathon %s",
				req.GetTrackId(),
				hackathonID,
			)
		}
		update = update.SetTrack(track)
	}
	if req.Image != nil {
		update = update.SetImage(req.GetImage())
	}

	_, err = update.Save(ctx)
	if err != nil {
		slog.Error("update project", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't update project in database")
	}

	// Fetch the updated project with creator, modifier, and track
	updated, err := s.dbClient.Project.Query().
		Where(entproject.IDEQ(projectID)).
		WithCreator().
		WithModifier().
		WithTrack().
		Only(ctx)
	if err != nil {
		slog.Error("query updated project", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query updated project")
	}

	entry := projectEntryFromEnt(updated, hackathonID)

	return &msgs.EditResponse{Project: entry}, nil
}

func (s *ProjectService) Delete(
	ctx context.Context,
	req *msgs.DeleteRequest,
) (*msgs.DeleteResponse, error) {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// Get the project to find its hackathon_id
	project, err := s.dbClient.Project.Query().
		Where(entproject.IDEQ(projectID)).
		WithHackathon().
		WithCreator().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "project %s not found", req.GetProjectId())
		}
		slog.Error("query project", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := project.Edges.Hackathon.ID

	err = s.enforcer.RequirePermission(
		ctx,
		hackathonID.String(),
		mw.Project,
		mw.Write,
		mw.WithProject(projectID.String()),
	)
	if err != nil {
		err = s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Project, mw.Write)
		if err != nil {
			return nil, status.Error(codes.PermissionDenied, "permission denied")
		}
	}

	// Delete the project
	if err := s.dbClient.Project.DeleteOne(project).Exec(ctx); err != nil {
		slog.Error("delete project", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't delete project from database")
	}
	if _, err = s.enforcer.RemoveRole(
		project.Edges.Creator.KeycloakID,
		mw.Owner,
		hackathonID.String(),
		mw.WithProject(project.ID.String()),
	); err != nil {
		return nil, status.Errorf(
			codes.Internal,
			"couldn't remove project owner permission: %v",
			err,
		)
	}

	return &msgs.DeleteResponse{}, nil
}
