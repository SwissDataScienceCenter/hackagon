package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathonforms "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonforms"
	entproject "github.com/swissdatasciencecenter/hackagon/components/backend/ent/project"
	entsubmission "github.com/swissdatasciencecenter/hackagon/components/backend/ent/submission"
	entteam "github.com/swissdatasciencecenter/hackagon/components/backend/ent/team"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/capability"
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
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

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

	// RequirePermission already speaks gRPC: PermissionDenied for an authenticated
	// caller, Unauthenticated for the anonymous subject, Internal when the
	// enforcer itself fails. Wrapping it would mask the last two as a denial.
	if err = s.enforcer.RequirePermission(ctx, hackathonID.String(), m.Hackathon, m.Read); err != nil {
		return nil, err
	}

	teams, err := s.dbClient.Team.Query().
		Where(entteam.HasProjectWith(entproject.HasHackathonWith(enthackathon.IDEQ(hackathonID)))).
		WithProject().
		WithCreator().
		WithMembers().
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
		WithSubmissions(func(sq *ent.SubmissionQuery) {
			sq.WithTeam().WithProject().WithCreator().WithModifier()
		}).
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
	if err = s.enforcer.RequirePermission(
		ctx,
		t.Edges.Project.Edges.Hackathon.ID.String(),
		m.Hackathon,
		m.Read,
	); err != nil {
		return nil, err
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
	hackathon, err := s.dbClient.Hackathon.Query().
		Where(enthackathon.HasProjectsWith(entproject.IDEQ(projectID))).
		Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "could not find hackathon: %v", err)
	}
	if err := s.enforcer.RequirePermission(ctx, hackathon.ID.String(), m.Team, m.Create); err != nil {
		return nil, err
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

	t, err := getTeamById(ctx, s, teamID)
	if err != nil {
		return nil, err
	}

	if t.Edges.Project == nil || t.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "team project or hackathon not found")
	}

	hackathonID := t.Edges.Project.Edges.Hackathon.ID.String()

	if err := s.enforcer.RequirePermission(
		ctx, hackathonID, m.Team, m.Write,
		m.WithTeam(t.ID.String()),
	); err != nil {
		if err := s.enforcer.RequirePermission(
			ctx, hackathonID, m.Team, m.Write,
		); err != nil {
			return nil, err
		}
	}

	u, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "user not found: %v", err)
	}

	update := s.dbClient.Team.UpdateOne(t).
		SetModifierID(u.ID)

	// The proto fields are optional, so the pointer — not the value — carries
	// intent: nil means "leave alone", a non-nil pointer applies even when it
	// points at "" (which is how a description gets cleared).
	if req.Name != nil {
		update.SetName(req.GetName())
	}
	if req.Description != nil {
		update.SetDescription(req.GetDescription())
	}

	updatedT, err := update.Save(ctx)
	if err != nil {
		// name is NotEmpty in the schema, so clearing it is a caller error.
		if ent.IsValidationError(err) {
			return nil, status.Errorf(codes.InvalidArgument, "invalid team: %v", err)
		}
		slog.Error("edit team", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't edit team: %v", err)
	}

	// Re-query with edges — Save() doesn't return edges.
	updatedT, err = s.dbClient.Team.Query().
		Where(entteam.IDEQ(updatedT.ID)).
		WithProject().
		WithCreator().
		WithModifier().
		WithMembers().
		WithSubmissions(func(sq *ent.SubmissionQuery) {
			sq.WithTeam().WithProject().WithCreator().WithModifier()
		}).
		Only(ctx)
	if err != nil {
		slog.Error("re-query team", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't re-query team: %v", err)
	}

	return &msgs.EditResponse{Team: teamEntryFromEnt(updatedT)}, nil
}

func (s *TeamService) Delete(
	ctx context.Context,
	req *msgs.DeleteRequest,
) (*msgs.DeleteResponse, error) {
	if _, _, err := m.RequireSubject(ctx); err != nil {
		return nil, err
	}

	teamID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid team_id: %v", err)
	}

	t, err := getTeamById(ctx, s, teamID)
	if err != nil {
		return nil, err
	}

	if t.Edges.Project == nil || t.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "team project or hackathon not found")
	}

	hackathonID := t.Edges.Project.Edges.Hackathon.ID.String()

	if err := s.enforcer.RequirePermission(
		ctx, hackathonID, m.Team, m.Write,
	); err != nil {
		return nil, err
	}

	// Remove members first to avoid FK constraint violation.
	if len(t.Edges.Members) > 0 {
		if err := s.dbClient.Team.UpdateOne(t).RemoveMembers(t.Edges.Members...).Exec(ctx); err != nil {
			slog.Error("remove team members", "err", err)
			return nil, status.Errorf(codes.Internal, "couldn't remove team members: %v", err)
		}
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
	if _, _, err := m.RequireSubject(ctx); err != nil {
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

	t, err := getTeamById(ctx, s, teamID)
	if err != nil {
		return nil, err
	}

	if t.Edges.Project == nil || t.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "team project or hackathon not found")
	}

	hackathonID := t.Edges.Project.Edges.Hackathon.ID.String()
	if err := s.enforcer.RequirePermission(
		ctx, hackathonID, m.Team, m.Write,
	); err != nil {
		return nil, err
	}

	u, err := s.dbClient.User.Get(ctx, userID)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "user %s not found", req.GetUserId())
	}

	// Membership is written twice — the join row and the team-scoped casbin
	// grant — and one without the other is drift: a seat nobody can act from,
	// or a permission nobody can see. The two stores cannot share a
	// transaction (casbin writes through its own connection; an ent tx held
	// open across that write deadlocks the SQLite test harness), so write the
	// inert half first and compensate: the join row alone grants nothing
	// until the casbin role lands.
	if _, err := s.dbClient.Team.UpdateOne(t).
		AddMembers(u).
		Save(ctx); err != nil {
		slog.Error("assign user to team", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't assign user to team: %v", err)
	}

	if _, err := s.enforcer.AddRole(
		u.KeycloakID, m.Member, hackathonID, m.WithTeam(t.ID.String()),
	); err != nil {
		slog.Error("add team role for user", "err", err)
		// Take the seat back out so the two stores still agree.
		if _, cerr := s.dbClient.Team.UpdateOne(t).
			RemoveMembers(u).
			Save(ctx); cerr != nil {
			slog.Error("compensate: remove member after failed role grant", "err", cerr)
		}

		return nil, status.Error(codes.Internal, "couldn't grant team role")
	}

	return &msgs.AssignUserResponse{}, nil
}

func (s *TeamService) RemoveUser(
	ctx context.Context,
	req *msgs.RemoveUserRequest,
) (*msgs.RemoveUserResponse, error) {
	if _, _, err := m.RequireSubject(ctx); err != nil {
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

	t, err := getTeamById(ctx, s, teamID)
	if err != nil {
		return nil, err
	}

	if t.Edges.Project == nil || t.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "team project or hackathon not found")
	}

	hackathonID := t.Edges.Project.Edges.Hackathon.ID.String()
	if err := s.enforcer.RequirePermission(
		ctx, hackathonID, m.Team, m.Write,
	); err != nil {
		return nil, err
	}

	u, err := s.dbClient.User.Get(ctx, userID)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "user %s not found", req.GetUserId())
	}

	// Same two-store problem as AssignUser, in reverse — and the same
	// no-shared-transaction constraint. Revoke the casbin role first: if the
	// row removal then fails, the leftover member is inert (visible but
	// powerless) rather than powerful and invisible.
	if _, err := s.enforcer.RemoveRole(
		u.KeycloakID, m.Member, hackathonID, m.WithTeam(t.ID.String()),
	); err != nil {
		slog.Error("remove team role for user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't revoke team role")
	}

	if _, err := s.dbClient.Team.UpdateOne(t).
		RemoveMembers(u).
		Save(ctx); err != nil {
		slog.Error("remove user from team", "err", err)
		// Put the role back so the two stores still agree.
		if _, cerr := s.enforcer.AddRole(
			u.KeycloakID, m.Member, hackathonID, m.WithTeam(t.ID.String()),
		); cerr != nil {
			slog.Error("compensate: restore team role after failed removal", "err", cerr)
		}

		return nil, status.Errorf(codes.Internal, "couldn't remove user from team: %v", err)
	}

	// Re-query with edges — Save() doesn't return edges.
	updatedT, err := s.dbClient.Team.Query().
		Where(entteam.IDEQ(teamID)).
		WithProject().
		WithCreator().
		WithModifier().
		WithMembers().
		WithSubmissions(func(sq *ent.SubmissionQuery) {
			sq.WithTeam().WithProject().WithCreator().WithModifier()
		}).
		Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "query updated team: %v", err)
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

	t, err := getTeamById(ctx, s, teamID)
	if err != nil {
		return nil, err
	}

	if t.Edges.Project == nil || t.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "team project or hackathon not found")
	}

	hackathonID := t.Edges.Project.Edges.Hackathon.ID.String()
	if err := s.enforcer.RequirePermission(
		ctx, hackathonID, m.Submission, m.Create,
		m.WithTeam(t.ID.String()),
	); err != nil {
		return nil, err
	}

	if err := requireWindowOpen(
		ctx, s.dbClient, t.Edges.Project.Edges.Hackathon.ID, windowSubmissions, time.Now(),
	); err != nil {
		return nil, err
	}

	if err := requireCapability(
		ctx, s.dbClient, s.enforcer,
		t.Edges.Project.Edges.Hackathon.ID, capability.CreateProjectSubmissions,
	); err != nil {
		return nil, err
	}

	// Structured answers are validated against the organizer's submission form
	// (ConfigService.SetSubmissionForm). Without a form defined, anything is
	// accepted — validation is opt-in by configuring one.
	if forms, err := s.dbClient.HackathonForms.Query().
		Where(enthackathonforms.HasHackathonWith(
			enthackathon.IDEQ(t.Edges.Project.Edges.Hackathon.ID),
		)).
		Only(ctx); err == nil {
		if err := validateAgainstFormSchema(
			forms.SubmissionFields, req.GetForm(), "submission",
		); err != nil {
			return nil, err
		}
	} else if !ent.IsNotFound(err) {
		slog.Error("query submission form", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	u, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "user not found: %v", err)
	}

	// The version is derived from a count, so two concurrent creates can pick the
	// same number; the unique (version, project, team) index rejects the loser
	// rather than letting it duplicate. Recount and try again once — that clears
	// an ordinary two-way race — and only ask the caller to retry if it collides
	// a second time.
	const versionAttempts = 2

	var subm *ent.Submission
	for attempt := 1; attempt <= versionAttempts; attempt++ {
		// Determine version.
		var version int
		version, err = s.dbClient.Submission.Query().
			Where(entsubmission.HasTeamWith(entteam.IDEQ(teamID)), entsubmission.HasProjectWith(entproject.IDEQ(projectID))).
			Count(ctx)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "couldn't determine submission version: %v", err)
		}

		subm, err = s.dbClient.Submission.Create().
			SetTeamID(teamID).
			SetProjectID(projectID).
			SetResult(req.GetResult()).
			SetStatus(entsubmission.StatusDraft).
			SetVersion(version + 1).
			SetCreatorID(u.ID).
			Save(ctx)
		if err == nil {
			break
		}
		if !ent.IsConstraintError(err) {
			slog.Error("create submission", "err", err)

			return nil, status.Errorf(codes.Internal, "couldn't create submission: %v", err)
		}
		if attempt == versionAttempts {
			slog.Warn("submission version conflict", "team", teamID, "project", projectID, "err", err)

			return nil, status.Error(
				codes.Aborted,
				"another submission was created at the same time, please retry",
			)
		}
	}

	return &msgs.CreateSubmissionResponse{Id: subm.ID.String()}, nil
}

func (s *TeamService) GetSubmission(
	ctx context.Context,
	req *msgs.GetSubmissionRequest,
) (*msgs.GetSubmissionResponse, error) {
	teamID, err := uuid.Parse(req.GetTeamId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid team_id: %v", err)
	}

	t, err := getTeamById(ctx, s, teamID)
	if err != nil {
		return nil, err
	}

	if t.Edges.Project == nil || t.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "team project or hackathon not found")
	}

	hackathonID := t.Edges.Project.Edges.Hackathon.ID.String()
	if err := s.enforcer.RequirePermission(
		ctx, hackathonID, m.Submission, m.Read,
		m.WithTeam(t.ID.String()),
	); err != nil {
		if err := s.enforcer.RequirePermission(
			ctx, hackathonID, m.Submission, m.Read,
		); err != nil {
			return nil, err
		}
	}

	// Find the latest submission for this team (highest version).
	subm, err := s.dbClient.Submission.Query().
		Where(entsubmission.HasTeamWith(entteam.IDEQ(teamID))).
		WithTeam().
		WithProject().
		WithCreator().
		WithModifier().
		Order(ent.Desc(entsubmission.FieldVersion)).
		First(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"no submission found for team %s",
				req.GetTeamId(),
			)
		}
		return nil, status.Errorf(codes.Internal, "query submission: %v", err)
	}

	return &msgs.GetSubmissionResponse{Submission: submissionEntryFromEnt(subm)}, nil
}

func (s *TeamService) ListSubmissions(
	ctx context.Context,
	req *msgs.ListSubmissionsRequest,
) (*msgs.ListSubmissionsResponse, error) {
	teamID, err := uuid.Parse(req.GetTeamId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid team_id: %v", err)
	}

	t, err := getTeamById(ctx, s, teamID)
	if err != nil {
		return nil, err
	}

	if t.Edges.Project == nil || t.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "team project or hackathon not found")
	}

	hackathonID := t.Edges.Project.Edges.Hackathon.ID.String()
	if err := s.enforcer.RequirePermission(
		ctx, hackathonID, m.Submission, m.Read,
		m.WithTeam(t.ID.String()),
	); err != nil {
		if err := s.enforcer.RequirePermission(
			ctx, hackathonID, m.Submission, m.Read,
		); err != nil {
			return nil, err
		}
	}

	submissions, err := s.dbClient.Submission.Query().
		Where(entsubmission.HasTeamWith(entteam.IDEQ(teamID))).
		WithTeam().
		WithProject().
		WithCreator().
		WithModifier().
		Order(ent.Asc(entsubmission.FieldVersion)).
		All(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "query submissions: %v", err)
	}

	entries := make([]*hackEnts.Submission, 0, len(submissions))
	for _, s := range submissions {
		entries = append(entries, submissionEntryFromEnt(s))
	}

	return &msgs.ListSubmissionsResponse{Submissions: entries}, nil
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
		WithTeam(func(tq *ent.TeamQuery) {
			tq.WithProject(func(pq *ent.ProjectQuery) {
				pq.WithHackathon()
			})
		}).
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

	// Use RBAC for authorization via the submission's team domain.
	if subm.Edges.Team == nil {
		return nil, status.Error(codes.Internal, "submission team")
	}

	hackathonID := subm.Edges.Team.Edges.Project.Edges.Hackathon.ID.String()
	if err := s.enforcer.RequirePermission(
		ctx,
		hackathonID,
		m.Submission,
		m.Write,
		m.WithTeam(subm.Edges.Team.ID.String()),
	); err != nil {
		return nil, err
	}

	// Finalizing is the act the deadline actually bites on, so it is gated as
	// well as CreateSubmission — otherwise a draft made before the close could
	// still be turned in afterwards.
	if err := requireCapability(
		ctx, s.dbClient, s.enforcer,
		subm.Edges.Team.Edges.Project.Edges.Hackathon.ID, capability.CreateProjectSubmissions,
	); err != nil {
		return nil, err
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

	// Re-query with edges — Save() doesn't return edges.
	updatedSubm, err = s.dbClient.Submission.Query().
		Where(entsubmission.IDEQ(updatedSubm.ID)).
		WithTeam().
		WithProject().
		WithCreator().
		WithModifier().
		Only(ctx)
	if err != nil {
		slog.Error("re-query submission", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't re-query submission: %v", err)
	}

	return &msgs.FinalizeSubmissionResponse{Submission: submissionEntryFromEnt(updatedSubm)}, nil
}

func getTeamById(ctx context.Context, s *TeamService, teamID uuid.UUID) (*ent.Team, error) {
	t, err := s.dbClient.Team.Query().
		Where(entteam.IDEQ(teamID)).
		WithProject(func(pq *ent.ProjectQuery) {
			pq.WithHackathon()
		}).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "team %s not found", teamID)
		}
		slog.Error("get team", "err", err)
		return nil, status.Errorf(codes.Internal, "query team: %v", err)
	}
	return t, nil
}

// EditSubmission updates a draft submission's content. Finalized submissions
// are frozen — edits after FinalizeSubmission are refused, and the edit is
// window-gated like CreateSubmission so post-deadline drafts cannot mutate.
func (s *TeamService) EditSubmission(
	ctx context.Context,
	req *msgs.EditSubmissionRequest,
) (*msgs.EditSubmissionResponse, error) {
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
		WithTeam(func(tq *ent.TeamQuery) {
			tq.WithProject(func(pq *ent.ProjectQuery) {
				pq.WithHackathon()
			})
		}).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "submission %s not found", req.GetSubmissionId())
		}

		return nil, status.Errorf(codes.Internal, "query submission: %v", err)
	}
	if subm.Edges.Team == nil || subm.Edges.Team.Edges.Project == nil ||
		subm.Edges.Team.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "submission team or hackathon not found")
	}

	hackathonID := subm.Edges.Team.Edges.Project.Edges.Hackathon.ID
	if err := s.enforcer.RequirePermission(
		ctx, hackathonID.String(), m.Submission, m.Write,
		m.WithTeam(subm.Edges.Team.ID.String()),
	); err != nil {
		return nil, err
	}

	if subm.Status == entsubmission.StatusFinal {
		return nil, status.Error(codes.FailedPrecondition, "submission is finalized and frozen")
	}
	if err := requireWindowOpen(ctx, s.dbClient, hackathonID, windowSubmissions, time.Now()); err != nil {
		return nil, err
	}

	u, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(sub)).Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "user not found: %v", err)
	}

	update := s.dbClient.Submission.UpdateOne(subm).SetModifierID(u.ID)
	if req.Result != nil {
		update.SetResult(req.GetResult())
	}
	if _, err := update.Save(ctx); err != nil {
		slog.Error("edit submission", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't edit submission: %v", err)
	}

	updated, err := s.dbClient.Submission.Query().
		Where(entsubmission.IDEQ(submID)).
		WithTeam().
		WithProject().
		WithCreator().
		WithModifier().
		Only(ctx)
	if err != nil {
		slog.Error("re-query submission", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't re-query submission: %v", err)
	}

	return &msgs.EditSubmissionResponse{Submission: submissionEntryFromEnt(updated)}, nil
}
