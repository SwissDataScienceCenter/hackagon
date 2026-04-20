package service

import (
	"context"
	"errors"
	"log"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type UserService struct {
	proto.UnimplementedUserServer
	dbClient *ent.Client
	enforcer *m.Enforcer
}

func NewUserService(dbClient *ent.Client, enf *m.Enforcer) *UserService {
	return &UserService{
		dbClient: dbClient,
		enforcer: enf,
	}
}

func userEntryFromEnt(u *ent.User) *proto.UserEntry {
	return &proto.UserEntry{
		Id:          u.ID.String(),
		Name:        u.Username,
		KeycloakId:  u.KeycloakID,
		DisplayName: u.DisplayName,
		Email:       u.Email,
		CreatedAt:   timestamppb.New(u.CreatedAt),
	}
}

func (s *UserService) List(
	ctx context.Context,
	req *proto.UserListRequest,
) (*proto.UserListResponse, error) {
	ok, err := s.enforcer.Enforce(ctx, "", m.User, m.Read)
	if err != nil {
		log.Printf("enforce error: %w", err)
		return nil, status.Error(codes.Internal, "authorization error")
	}
	if !ok {
		return nil, status.Error(codes.PermissionDenied, "permission denied")
	}
	users, err := s.dbClient.User.Query().All(ctx)
	if err != nil {
		log.Printf("query user: %w", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	entries := make([]*proto.UserEntry, 0, len(users))
	for _, u := range users {
		entries = append(entries, userEntryFromEnt(u))
	}
	return &proto.UserListResponse{Users: entries}, nil
}

func (s *UserService) WhoAmI(
	ctx context.Context,
	_ *proto.WhoAmIRequest,
) (*proto.WhoAmIResponse, error) {
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

	return &proto.WhoAmIResponse{User: userEntryFromEnt(u)}, nil
}

func (s *UserService) Register(
	ctx context.Context,
	_ *proto.RegisterRequest,
) (*proto.RegisterResponse, error) {
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
		return &proto.RegisterResponse{User: userEntryFromEnt(existing)}, nil
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

	return &proto.RegisterResponse{User: userEntryFromEnt(u)}, nil
}
