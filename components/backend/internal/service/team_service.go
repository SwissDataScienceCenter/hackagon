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

	if err = s.enforcer.RequirePermission(ctx, hackathonID.String(), m.Team, m.Read); err != nil {
		return nil, status.Error(codes.PermissionDenied, "can't get teams")
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
		m.Team,
		m.Read,
	); err != nil {
		return nil, status.Error(codes.PermissionDenied, "can't get teams")
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

	// Team creation is only allowed for approved projects.
	project, err := s.dbClient.Project.Get(ctx, projectID)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "project %s not found", projectID)
	}
	if project.Status != entproject.StatusApproved {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"can only create teams for approved projects",
		)
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

	// Add to DB members.
	_, err = s.dbClient.Team.UpdateOne(t).
		AddMembers(u).
		Save(ctx)
	if err != nil {
		slog.Error("assign user to team", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't assign user to team: %v", err)
	}

	// Add to casbin team role.
	_, err = s.enforcer.AddRole(u.KeycloakID, m.Member, hackathonID, m.WithTeam(t.ID.String()))
	if err != nil {
		slog.Error("add team role for user", "err", err)
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

	// Remove from DB members.
	_, err = s.dbClient.Team.UpdateOne(t).
		RemoveMembers(u).
		Save(ctx)
	if err != nil {
		slog.Error("remove user from team", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't remove user from team: %v", err)
	}

	// Remove from casbin team role.
	_, err = s.enforcer.RemoveRole(u.KeycloakID, m.Member, hackathonID, m.WithTeam(t.ID.String()))
	if err != nil {
		slog.Error("remove team role for user", "err", err)
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

// hackathonContext holds the hackathon with all its teams, members, and participants loaded.
type hackathonContext struct {
	hackathon    *ent.Hackathon
	teamsByID    map[uuid.UUID]*ent.Team
	userTeamMap  map[uuid.UUID]uuid.UUID // userID -> teamID (for users on a team)
	participants map[uuid.UUID]bool
}

// loadHackathonContext loads a hackathon with all its teams (and their members)
// and participating users in a single query.
func (s *TeamService) loadHackathonContext(
	ctx context.Context,
	hackathonID uuid.UUID,
) (*hackathonContext, error) {
	h, err := s.dbClient.Hackathon.Query().
		Where(enthackathon.IDEQ(hackathonID)).
		WithProjects(func(pq *ent.ProjectQuery) {
			pq.WithTeams(func(tq *ent.TeamQuery) {
				tq.WithMembers()
			})
		}).
		WithParticipatingUsers().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "hackathon %s not found", hackathonID)
		}
		slog.Error("query hackathon", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	teamsByID := make(map[uuid.UUID]*ent.Team)
	for _, p := range h.Edges.Projects {
		for _, t := range p.Edges.Teams {
			teamsByID[t.ID] = t
		}
	}

	userTeamMap := make(map[uuid.UUID]uuid.UUID)
	for _, t := range teamsByID {
		for _, u := range t.Edges.Members {
			userTeamMap[u.ID] = t.ID
		}
	}

	participants := make(map[uuid.UUID]bool)
	for _, u := range h.Edges.ParticipatingUsers {
		participants[u.ID] = true
	}

	return &hackathonContext{
		hackathon:    h,
		teamsByID:    teamsByID,
		userTeamMap:  userTeamMap,
		participants: participants,
	}, nil
}

// validateUsersAreParticipants checks that all requested user IDs are participants.
func (hc *hackathonContext) validateUsersAreParticipants(userIDs []uuid.UUID) error {
	for _, uid := range userIDs {
		if !hc.participants[uid] {
			return status.Errorf(
				codes.InvalidArgument,
				"user %s is not a participant in hackathon %s",
				uid,
				hc.hackathon.ID,
			)
		}
	}
	return nil
}

// validateTeamsExist checks that all requested team IDs exist in this hackathon.
func (hc *hackathonContext) validateTeamsExist(teamIDs []uuid.UUID) error {
	for _, tid := range teamIDs {
		if _, ok := hc.teamsByID[tid]; !ok {
			return status.Errorf(codes.InvalidArgument, "team %s not found in hackathon", tid)
		}
	}
	return nil
}

// parseAssignments parses assignment pairs and returns validated team/user IDs and the assignment map.
func (s *TeamService) parseAssignments(
	assignments []*msgs.BulkAssignUsersRequest_Assignment,
) ([]uuid.UUID, []uuid.UUID, map[uuid.UUID]uuid.UUID, error) {
	teamIDs := make([]uuid.UUID, 0, len(assignments))
	userIDs := make([]uuid.UUID, 0, len(assignments))
	assignmentMap := make(map[uuid.UUID]uuid.UUID)

	for _, a := range assignments {
		teamID, err := uuid.Parse(a.GetTeamId())
		if err != nil {
			return nil, nil, nil, status.Errorf(
				codes.InvalidArgument,
				"invalid team_id in assignment: %v",
				err,
			)
		}
		teamIDs = append(teamIDs, teamID)

		userID, err := uuid.Parse(a.GetUserId())
		if err != nil {
			return nil, nil, nil, status.Errorf(
				codes.InvalidArgument,
				"invalid user_id in assignment: %v",
				err,
			)
		}
		userIDs = append(userIDs, userID)
		assignmentMap[userID] = teamID
	}
	return teamIDs, userIDs, assignmentMap, nil
}

// parseUserIDs parses a list of user ID strings into UUIDs.
func (s *TeamService) parseUserIDs(userIDs []string) ([]uuid.UUID, error) {
	result := make([]uuid.UUID, 0, len(userIDs))
	for _, uid := range userIDs {
		userUUID, err := uuid.Parse(uid)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
		result = append(result, userUUID)
	}
	return result, nil
}

// determineTeamMoves determines which users need to move between teams.
func determineTeamMoves(
	assignments map[uuid.UUID]uuid.UUID,
	userTeamMap map[uuid.UUID]uuid.UUID,
) (map[uuid.UUID]uuid.UUID, map[uuid.UUID][]string, map[uuid.UUID][]string) {
	usersOnTeam := make(map[uuid.UUID]uuid.UUID)
	usersByOldTeam := make(map[uuid.UUID][]string)
	usersByNewTeam := make(map[uuid.UUID][]string)

	for userID, targetTeam := range assignments {
		currentTeam := userTeamMap[userID]
		if currentTeam == targetTeam {
			// Already on target team — skip.
			delete(assignments, userID)
			continue
		}
		if currentTeam != uuid.Nil {
			// On a different team — needs to move.
			usersOnTeam[userID] = currentTeam
			usersByOldTeam[currentTeam] = append(usersByOldTeam[currentTeam], userID.String())
		}
		usersByNewTeam[targetTeam] = append(usersByNewTeam[targetTeam], userID.String())
	}
	return usersOnTeam, usersByOldTeam, usersByNewTeam
}

// findUsersOnTeams finds which users are currently on teams.
func findUsersOnTeams(
	userIDs []uuid.UUID,
	userTeamMap map[uuid.UUID]uuid.UUID,
) []struct {
	userID uuid.UUID
	teamID uuid.UUID
} {
	var result []struct {
		userID uuid.UUID
		teamID uuid.UUID
	}
	for _, userID := range userIDs {
		if teamID, ok := userTeamMap[userID]; ok {
			result = append(result, struct {
				userID uuid.UUID
				teamID uuid.UUID
			}{userID: userID, teamID: teamID})
		}
	}
	return result
}

// bulkAssignCasbin handles casbin role changes for bulk assign.
func (s *TeamService) bulkAssignCasbin(
	_ context.Context,
	hackathonID uuid.UUID,
	usersByOldTeam, usersByNewTeam map[uuid.UUID][]string,
) error {
	var casbinRemovedOld bool

	// Remove old roles.
	for teamID, uids := range usersByOldTeam {
		_, err := s.enforcer.RemoveRoleBatch(
			uids,
			m.Member,
			hackathonID.String(),
			m.WithTeam(teamID.String()),
		)
		if err != nil {
			if casbinRemovedOld {
				for tID, uIDs := range usersByOldTeam {
					_, _ = s.enforcer.AddRoleBatch(
						uIDs,
						m.Member,
						hackathonID.String(),
						m.WithTeam(tID.String()),
					)
				}
			}
			slog.Error("bulk remove old team roles", "err", err)
			return status.Errorf(codes.Internal, "couldn't remove old casbin roles: %v", err)
		}
		casbinRemovedOld = true
	}

	// Add new roles.
	for teamID, uids := range usersByNewTeam {
		_, err := s.enforcer.AddRoleBatch(
			uids,
			m.Member,
			hackathonID.String(),
			m.WithTeam(teamID.String()),
		)
		if err != nil {
			if casbinRemovedOld {
				for tID, uIDs := range usersByOldTeam {
					_, _ = s.enforcer.AddRoleBatch(
						uIDs,
						m.Member,
						hackathonID.String(),
						m.WithTeam(tID.String()),
					)
				}
			}
			slog.Error("bulk add new team roles", "err", err)
			return status.Errorf(codes.Internal, "couldn't add new casbin roles: %v", err)
		}
	}
	return nil
}

// bulkAssignTx handles the ent transaction for bulk assign.
func (s *TeamService) bulkAssignTx(
	ctx context.Context,
	tx *ent.Tx,
	usersOnTeam map[uuid.UUID]uuid.UUID,
	assignments map[uuid.UUID]uuid.UUID,
) error {
	// Remove from old teams.
	for userID, teamID := range usersOnTeam {
		u, err := tx.User.Get(ctx, userID)
		if err != nil {
			_ = tx.Rollback()
			slog.Error("get user for remove", "err", err)
			return status.Errorf(codes.Internal, "couldn't get user: %v", err)
		}
		t, err := tx.Team.Get(ctx, teamID)
		if err != nil {
			_ = tx.Rollback()
			slog.Error("get team for remove", "err", err)
			return status.Errorf(codes.Internal, "couldn't get team: %v", err)
		}
		if _, err := tx.Team.UpdateOne(t).RemoveMembers(u).Save(ctx); err != nil {
			_ = tx.Rollback()
			slog.Error("remove user from old team", "err", err)
			return status.Errorf(codes.Internal, "couldn't remove user from team: %v", err)
		}
	}

	// Add to new teams.
	for userID, teamID := range assignments {
		u, err := tx.User.Get(ctx, userID)
		if err != nil {
			_ = tx.Rollback()
			slog.Error("get user for add", "err", err)
			return status.Errorf(codes.Internal, "couldn't get user: %v", err)
		}
		t, err := tx.Team.Get(ctx, teamID)
		if err != nil {
			_ = tx.Rollback()
			slog.Error("get team for add", "err", err)
			return status.Errorf(codes.Internal, "couldn't get team: %v", err)
		}
		if _, err := tx.Team.UpdateOne(t).AddMembers(u).Save(ctx); err != nil {
			_ = tx.Rollback()
			slog.Error("add user to new team", "err", err)
			return status.Errorf(codes.Internal, "couldn't add user to team: %v", err)
		}
	}
	return nil
}

// bulkRemoveCasbin handles casbin role removal for bulk remove.
func (s *TeamService) bulkRemoveCasbin(
	_ context.Context,
	hackathonID uuid.UUID,
	usersByTeam map[uuid.UUID][]string,
) error {
	var casbinRemoved bool
	for teamID, uids := range usersByTeam {
		_, err := s.enforcer.RemoveRoleBatch(
			uids,
			m.Member,
			hackathonID.String(),
			m.WithTeam(teamID.String()),
		)
		if err != nil {
			if casbinRemoved {
				for teamID, uids := range usersByTeam {
					_, _ = s.enforcer.AddRoleBatch(
						uids,
						m.Member,
						hackathonID.String(),
						m.WithTeam(teamID.String()),
					)
				}
			}
			slog.Error("bulk remove team roles", "err", err)
			return status.Errorf(codes.Internal, "couldn't remove casbin roles: %v", err)
		}
		casbinRemoved = true
	}
	return nil
}

// bulkRemoveTx handles the ent transaction for bulk remove.
func (s *TeamService) bulkRemoveTx(
	ctx context.Context,
	tx *ent.Tx,
	userTeams []struct {
		userID uuid.UUID
		teamID uuid.UUID
	},
) error {
	for _, ut := range userTeams {
		t, err := tx.Team.Get(ctx, ut.teamID)
		if err != nil {
			_ = tx.Rollback()
			slog.Error("get team", "err", err)
			return status.Errorf(codes.Internal, "couldn't get team: %v", err)
		}
		u, err := tx.User.Get(ctx, ut.userID)
		if err != nil {
			_ = tx.Rollback()
			slog.Error("get user", "err", err)
			return status.Errorf(codes.Internal, "couldn't get user: %v", err)
		}
		if _, err := tx.Team.UpdateOne(t).RemoveMembers(u).Save(ctx); err != nil {
			_ = tx.Rollback()
			slog.Error("remove user from team", "err", err)
			return status.Errorf(codes.Internal, "couldn't remove user from team: %v", err)
		}
	}
	return nil
}

func (s *TeamService) BulkAssignUsers(
	ctx context.Context,
	req *msgs.BulkAssignUsersRequest,
) (*msgs.BulkAssignUsersResponse, error) {
	if _, _, err := m.RequireSubject(ctx); err != nil {
		return nil, err
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), m.Team, m.Write); err != nil {
		return nil, err
	}

	// Load hackathon with all teams (and their members) and participants in one query.
	hc, err := s.loadHackathonContext(ctx, hackathonID)
	if err != nil {
		return nil, err
	}

	// Parse and collect all team IDs and user IDs from assignments.
	teamIDs, userIDs, assignments, err := s.parseAssignments(req.GetAssignments())
	if err != nil {
		return nil, err
	}

	if err := hc.validateTeamsExist(teamIDs); err != nil {
		return nil, err
	}

	if err := hc.validateUsersAreParticipants(userIDs); err != nil {
		return nil, err
	}

	usersOnTeam, usersByOldTeam, usersByNewTeam := determineTeamMoves(assignments, hc.userTeamMap)

	// Casbin — batch remove old roles, batch add new roles.
	if err := s.bulkAssignCasbin(ctx, hackathonID, usersByOldTeam, usersByNewTeam); err != nil {
		return nil, err
	}

	// Ent transaction — remove from old teams, add to new teams.
	tx, err := s.dbClient.Tx(ctx)
	if err != nil {
		// Rollback casbin.
		for teamID, uids := range usersByNewTeam {
			_, _ = s.enforcer.RemoveRoleBatch(
				uids,
				m.Member,
				hackathonID.String(),
				m.WithTeam(teamID.String()),
			)
		}
		slog.Error("start tx", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't start transaction: %v", err)
	}

	if err := s.bulkAssignTx(ctx, tx, usersOnTeam, assignments); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		// Rollback casbin.
		for teamID, uids := range usersByNewTeam {
			_, _ = s.enforcer.RemoveRoleBatch(
				uids,
				m.Member,
				hackathonID.String(),
				m.WithTeam(teamID.String()),
			)
		}
		slog.Error("commit tx", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't commit transaction: %v", err)
	}

	return &msgs.BulkAssignUsersResponse{}, nil
}

func (s *TeamService) BulkRemoveUsers(
	ctx context.Context,
	req *msgs.BulkRemoveUsersRequest,
) (*msgs.BulkRemoveUsersResponse, error) {
	if _, _, err := m.RequireSubject(ctx); err != nil {
		return nil, err
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check RBAC permission.
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), m.Team, m.Write); err != nil {
		return nil, err
	}

	// Load hackathon with all teams (and their members) and participants in one query.
	hc, err := s.loadHackathonContext(ctx, hackathonID)
	if err != nil {
		return nil, err
	}

	// Parse user IDs.
	userIDs, err := s.parseUserIDs(req.GetUserIds())
	if err != nil {
		return nil, err
	}

	// Validate all users are participants.
	if err := hc.validateUsersAreParticipants(userIDs); err != nil {
		return nil, err
	}

	// Build user -> team mapping for users who are on a team.
	userTeams := findUsersOnTeams(userIDs, hc.userTeamMap)

	// Group users by their current team for casbin removal.
	usersByTeam := make(map[uuid.UUID][]string)
	for _, ut := range userTeams {
		usersByTeam[ut.teamID] = append(usersByTeam[ut.teamID], ut.userID.String())
	}

	// Casbin — batch remove roles per team.
	if err := s.bulkRemoveCasbin(ctx, hackathonID, usersByTeam); err != nil {
		return nil, err
	}

	// Ent transaction — remove users from teams.
	tx, err := s.dbClient.Tx(ctx)
	if err != nil {
		// Rollback: re-add roles per team.
		for teamID, uids := range usersByTeam {
			_, _ = s.enforcer.AddRoleBatch(
				uids,
				m.Member,
				hackathonID.String(),
				m.WithTeam(teamID.String()),
			)
		}
		slog.Error("start tx", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't start transaction: %v", err)
	}

	if err := s.bulkRemoveTx(ctx, tx, userTeams); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		// Rollback: re-add roles per team.
		for teamID, uids := range usersByTeam {
			_, _ = s.enforcer.AddRoleBatch(
				uids,
				m.Member,
				hackathonID.String(),
				m.WithTeam(teamID.String()),
			)
		}
		slog.Error("commit tx", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't commit transaction: %v", err)
	}

	return &msgs.BulkRemoveUsersResponse{}, nil
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
