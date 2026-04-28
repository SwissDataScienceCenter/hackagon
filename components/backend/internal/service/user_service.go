package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/messages/user_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type UserService struct {
	user.UnimplementedUserServiceServer
	dbClient *ent.Client
	enforcer *m.Enforcer
}

func NewUserService(dbClient *ent.Client, enf *m.Enforcer) *UserService {
	return &UserService{
		dbClient: dbClient,
		enforcer: enf,
	}
}

func userEntryFromEnt(u *ent.User) *ents.User {
	return &ents.User{
		Id:          u.ID.String(),
		Username:    u.Username,
		KeycloakId:  u.KeycloakID,
		DisplayName: u.DisplayName,
		Email:       u.Email,
		CreatedAt:   timestamppb.New(u.CreatedAt),
		ModifiedAt:  timestamppb.New(u.ModifiedAt),
	}
}

func (s *UserService) List(
	ctx context.Context,
	req *msgs.ListRequest,
) (*msgs.ListResponse, error) {
	if err := s.enforcer.RequirePermission(ctx, "", m.User, m.Read); err != nil {
		return nil, err
	}
	users, err := s.dbClient.User.Query().All(ctx)
	if err != nil {
		slog.Error("query user", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	entries := make([]*ents.User, 0, len(users))
	for _, u := range users {
		entries = append(entries, userEntryFromEnt(u))
	}
	return &msgs.ListResponse{Users: entries}, nil
}

func (s *UserService) Get(
	ctx context.Context,
	req *msgs.GetRequest,
) (*msgs.GetResponse, error) {
	if err := s.enforcer.RequirePermission(ctx, "", m.User, m.Read); err != nil {
		return nil, err
	}
	id, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}
	u, err := s.dbClient.User.Query().Where(entuser.IDEQ(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", req.GetUserId())
		}
		slog.Error("query user", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	rawRoles, err := s.enforcer.GetGlobalRoles(u.KeycloakID)
	if err != nil {
		slog.Error("get global roles", "err", err)
		return nil, status.Error(codes.Internal, "couldn't resolve user roles")
	}
	entry := userEntryFromEnt(u)
	for _, r := range rawRoles {
		switch r {
		case m.Admin.String():
			entry.Roles = append(entry.Roles, ents.GlobalRole_GLOBAL_ROLE_ADMIN)
		case m.HackathonOrganizer.String():
			entry.Roles = append(entry.Roles, ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER)
		}
	}
	return &msgs.GetResponse{User: entry}, nil
}

func (s *UserService) WhoAmI(
	ctx context.Context,
	_ *msgs.WhoAmIRequest,
) (*msgs.WhoAmIResponse, error) {
	sub, claims, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	u, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Error(codes.NotFound, "user not registered on platform")
		}
		return nil, status.Errorf(codes.Internal, "query user: %v", err)
	}

	// Sync profile fields from Keycloak if they changed.
	wantUsername := m.UsernameFromClaims(claims, sub)
	wantDisplayName := m.DisplayNameFromClaims(claims)
	wantEmail := m.EmailFromClaims(claims)
	if u.Username != wantUsername || u.DisplayName != wantDisplayName || u.Email != wantEmail {
		u, err = u.Update().
			SetUsername(wantUsername).
			SetDisplayName(wantDisplayName).
			SetEmail(wantEmail).
			Save(ctx)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "sync user profile: %v", err)
		}
	}

	return &msgs.WhoAmIResponse{User: userEntryFromEnt(u)}, nil
}

func (s *UserService) Register(
	ctx context.Context,
	_ *msgs.RegisterRequest,
) (*msgs.RegisterResponse, error) {
	sub, claims, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	username := m.UsernameFromClaims(claims, sub)
	displayName := m.DisplayNameFromClaims(claims)
	email := m.EmailFromClaims(claims)

	// Idempotent: return existing user if already registered,
	// syncing profile fields from Keycloak if they changed.
	existing, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err == nil {
		if existing.Username != username || existing.DisplayName != displayName || existing.Email != email {
			existing, err = existing.Update().
				SetUsername(username).
				SetDisplayName(displayName).
				SetEmail(email).
				Save(ctx)
			if err != nil {
				return nil, status.Errorf(codes.Internal, "sync user profile: %v", err)
			}
		}
		return &msgs.RegisterResponse{User: userEntryFromEnt(existing)}, nil
	}
	if !ent.IsNotFound(err) {
		return nil, status.Errorf(codes.Internal, "check existing user: %v", err)
	}

	u, err := s.dbClient.User.Create().
		SetKeycloakID(sub).
		SetUsername(username).
		SetDisplayName(displayName).
		SetEmail(email).
		Save(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create user: %v", err)
	}

	return &msgs.RegisterResponse{User: userEntryFromEnt(u)}, nil
}
