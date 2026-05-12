package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entproject "github.com/swissdatasciencecenter/hackagon/components/backend/ent/project"
	entsubmission "github.com/swissdatasciencecenter/hackagon/components/backend/ent/submission"
	entteam "github.com/swissdatasciencecenter/hackagon/components/backend/ent/team"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/team_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type TeamService struct {
	hackathon.UnimplementedTeamServiceServer
	dbClient *ent.Client
	enforcer *m.Enforcer
}

func NewTeamService(dbClient *ent.Client, enf *m.Enforcer) *TeamService {
	return &TeamService{
		UnimplementedTeamServiceServer: hackathon.UnimplementedTeamServiceServer{},
		dbClient:                       dbClient,
		enforcer:                       enf,
	}
}

func (s *TeamService) List(
	ctx context.Context,
	req *msgs.ListRequest,
) (*msgs.ListResponse, error) {
	// TODO: casbin check once role-granting RPCs exist
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	teams, err := s.dbClient.Team.Query().
		Where(entteam.HasProjectWith(entproject.HasHackathonWith(enthackathon.IDEQ(hackathonID)))).
		WithProject().
		WithCreator().
		All(ctx)
	if err != nil {
		slog.Error("query teams", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query teams")
	}

	entries := make([]*hackEnts.Team, 0, len(teams))
	for _, t := range teams {
		entries = append(entries, teamEntryFromEnt(t))
	}

	return &msgs.ListResponse{Teams: entries}, nil
}

func (s *TeamService) Get(
	ctx context.Context,
	req *msgs.GetRequest,
) (*msgs.GetResponse, error) {
	// TODO: casbin check once role-granting RPCs exist
	teamID, err := uuid.Parse(req.GetTeamId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid team_id: %v", err)
	}

	t, err := s.dbClient.Team.Query().
		Where(entteam.IDEQ(teamID)).
		WithProject(func(pq *ent.ProjectQuery) {
			pq.WithHackathon()
		}).
		WithCreator().
		WithModifier().
		WithMembers().
		WithSubmissions().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "team %s not found", req.GetTeamId())
		}
		slog.Error("query team", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query team")
	}

	if t.Edges.Project == nil || t.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "team project or hackathon not found")
	}

	return &msgs.GetResponse{Team: teamEntryFromEnt(t)}, nil
}

func (s *TeamService) Create(
	ctx context.Context,
	req *msgs.CreateRequest,
) (*msgs.CreateResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	u, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "user not found: %v", err)
	}

	projectID, err := uuid.Parse(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	t, err := s.dbClient.Team.Create().
		SetName(req.GetName()).
		SetDescription(req.GetDescription()).
		SetProjectID(projectID).
		SetCreatorID(u.ID).
		Save(ctx)
	if err != nil {
		slog.Error("create team", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't create team: %v", err)
	}

	_, err = s.dbClient.Team.UpdateOne(t).
		AddMembers(u).
		Save(ctx)
	if err != nil {
		slog.Error("add creator to team", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't add creator to team: %v", err)
	}

	return &msgs.CreateResponse{TeamId: t.ID.String()}, nil
}

func (s *TeamService) Edit(
	ctx context.Context,
	req *msgs.EditRequest,
) (*msgs.EditResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	teamID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid team_id: %v", err)
	}

	t, err := s.dbClient.Team.Query().
		Where(entteam.IDEQ(teamID)).
		WithProject(func(pq *ent.ProjectQuery) {
			pq.WithHackathon()
		}).
		WithCreator().
		WithModifier().
		WithMembers().
		WithSubmissions().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "team %s not found", req.GetId())
		}
		return nil, status.Errorf(codes.Internal, "query team: %v", err)
	}

	isMember := false
	for _, m := range t.Edges.Members {
		if m.KeycloakID == sub {
			isMember = true
			break
		}
	}
	if !isMember {
		return nil, status.Error(codes.PermissionDenied, "only team members can edit the team")
	}

	u, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "user not found: %v", err)
	}

	update := s.dbClient.Team.UpdateOne(t).
		SetModifierID(u.ID)

	if req.GetName() != "" {
		update.SetName(req.GetName())
	}
	if req.GetDescription() != "" {
		update.SetDescription(req.GetDescription())
	}

	updatedT, err := update.Save(ctx)
	if err != nil {
		slog.Error("edit team", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't edit team: %v", err)
	}

	if updatedT.Edges.Project == nil || updatedT.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "team project or hackathon not found")
	}

	return &msgs.EditResponse{Team: teamEntryFromEnt(updatedT)}, nil
}

func (s *TeamService) Delete(
	ctx context.Context,
	req *msgs.DeleteRequest,
) (*msgs.DeleteResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	teamID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid team_id: %v", err)
	}

	t, err := s.dbClient.Team.Query().
		Where(entteam.IDEQ(teamID)).
		WithMembers().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "team %s not found", req.GetId())
		}
		return nil, status.Errorf(codes.Internal, "query team: %v", err)
	}

	isMember := false
	for _, m := range t.Edges.Members {
		if m.KeycloakID == sub {
			isMember = true
			break
		}
	}
	if !isMember {
		return nil, status.Error(codes.PermissionDenied, "only team members can delete the team")
	}

	err = s.dbClient.Team.DeleteOne(t).Exec(ctx)
	if err != nil {
		slog.Error("delete team", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't delete team: %v", err)
	}

	return &msgs.DeleteResponse{}, nil
}

func (s *TeamService) AssignUser(
	ctx context.Context,
	req *msgs.AssignUserRequest,
) (*msgs.AssignUserResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	teamID, err := uuid.Parse(req.GetTeamId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid team_id: %v", err)
	}
	userID, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	t, err := s.dbClient.Team.Query().
		Where(entteam.IDEQ(teamID)).
		WithProject(func(pq *ent.ProjectQuery) {
			pq.WithHackathon()
		}).
		WithMembers().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "team %s not found", req.GetTeamId())
		}
		return nil, status.Errorf(codes.Internal, "query team: %v", err)
	}

	isMember := false
	for _, m := range t.Edges.Members {
		if m.KeycloakID == sub {
			isMember = true
			break
		}
	}
	if !isMember {
		return nil, status.Error(codes.PermissionDenied, "only team members can assign users")
	}

	u, err := s.dbClient.User.Get(ctx, userID)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "user %s not found", req.GetUserId())
	}

	_, err = s.dbClient.Team.UpdateOne(t).
		AddMembers(u).
		Save(ctx)
	if err != nil {
		slog.Error("assign user to team", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't assign user to team: %v", err)
	}

	return &msgs.AssignUserResponse{}, nil
}

func (s *TeamService) RemoveUser(
	ctx context.Context,
	req *msgs.RemoveUserRequest,
) (*msgs.RemoveUserResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	teamID, err := uuid.Parse(req.GetTeamId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid team_id: %v", err)
	}
	userID, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	t, err := s.dbClient.Team.Query().
		Where(entteam.IDEQ(teamID)).
		WithMembers().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "team %s not found", req.GetTeamId())
		}
		return nil, status.Errorf(codes.Internal, "query team: %v", err)
	}

	isMember := false
	for _, m := range t.Edges.Members {
		if m.KeycloakID == sub {
			isMember = true
			break
		}
	}
	if !isMember {
		return nil, status.Error(codes.PermissionDenied, "only team members can remove users")
	}

	u, err := s.dbClient.User.Get(ctx, userID)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "user %s not found", req.GetUserId())
	}

	_, err = s.dbClient.Team.UpdateOne(t).
		RemoveMembers(u).
		Save(ctx)
	if err != nil {
		slog.Error("remove user from team", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't remove user from team: %v", err)
	}

	updatedT, err := s.dbClient.Team.Query().
		Where(entteam.IDEQ(teamID)).
		WithProject(func(pq *ent.ProjectQuery) {
			pq.WithHackathon()
		}).
		WithCreator().
		WithModifier().
		WithMembers().
		WithSubmissions().
		Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "query updated team: %v", err)
	}

	if updatedT.Edges.Project == nil || updatedT.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "team project or hackathon not found")
	}

	return &msgs.RemoveUserResponse{Team: teamEntryFromEnt(updatedT)}, nil
}

func (s *TeamService) CreateSubmission(
	ctx context.Context,
	req *msgs.CreateSubmissionRequest,
) (*msgs.CreateSubmissionResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	teamID, err := uuid.Parse(req.GetTeamId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid team_id: %v", err)
	}
	projectID, err := uuid.Parse(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	t, err := s.dbClient.Team.Query().
		Where(entteam.IDEQ(teamID)).
		WithMembers().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "team %s not found", req.GetTeamId())
		}
		return nil, status.Errorf(codes.Internal, "query team: %v", err)
	}

	isMember := false
	for _, m := range t.Edges.Members {
		if m.KeycloakID == sub {
			isMember = true
			break
		}
	}
	if !isMember {
		return nil, status.Error(codes.PermissionDenied, "only team members can create submissions")
	}

	u, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "user not found: %v", err)
	}

	// Determine version.
	version, err := s.dbClient.Submission.Query().
		Where(entsubmission.HasTeamWith(entteam.IDEQ(teamID)), entsubmission.HasProjectWith(entproject.IDEQ(projectID))).
		Count(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "couldn't determine submission version: %v", err)
	}

	subm, err := s.dbClient.Submission.Create().
		SetTeamID(teamID).
		SetProjectID(projectID).
		SetResult(req.GetResult()).
		SetStatus(entsubmission.StatusDraft).
		SetVersion(version + 1).
		SetCreatorID(u.ID).
		Save(ctx)
	if err != nil {
		slog.Error("create submission", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't create submission: %v", err)
	}

	return &msgs.CreateSubmissionResponse{Id: subm.ID.String()}, nil
}

func (s *TeamService) FinalizeSubmission(
	ctx context.Context,
	req *msgs.FinalizeSubmissionRequest,
) (*msgs.FinalizeSubmissionResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	submID, err := uuid.Parse(req.GetSubmissionId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid submission_id: %v", err)
	}

	subm, err := s.dbClient.Submission.Query().
		Where(entsubmission.IDEQ(submID)).
		WithTeam().
		WithProject().
		WithCreator().
		WithModifier().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"submission %s not found",
				req.GetSubmissionId(),
			)
		}
		return nil, status.Errorf(codes.Internal, "query submission: %v", err)
	}

	// Check if user is a member of the team that owns this submission.
	isMember := false
	for _, m := range subm.Edges.Team.Edges.Members {
		if m.KeycloakID == sub {
			isMember = true
			break
		}
	}
	if !isMember {
		return nil, status.Error(
			codes.PermissionDenied,
			"only team members can finalize the submission",
		)
	}

	u, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "user not found: %v", err)
	}

	updatedSubm, err := s.dbClient.Submission.UpdateOne(subm).
		SetStatus(entsubmission.StatusFinal).
		SetModifierID(u.ID).
		Save(ctx)
	if err != nil {
		slog.Error("finalize submission", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't finalize submission: %v", err)
	}

	return &msgs.FinalizeSubmissionResponse{Submission: submissionEntryFromEnt(updatedSubm)}, nil
}
