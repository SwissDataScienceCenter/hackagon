package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/messages/user_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type UserService struct {
	user.UnimplementedUserServiceServer
	dbClient *ent.Client
	enforcer *m.Enforcer
}

func NewUserService(dbClient *ent.Client, enf *m.Enforcer) *UserService {
	return &UserService{
		UnimplementedUserServiceServer: user.UnimplementedUserServiceServer{},
		dbClient:                       dbClient,
		enforcer:                       enf,
	}
}

func (s *UserService) List(
	ctx context.Context,
	_ *msgs.ListRequest,
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
	globalRoles, err := s.enforcer.GetGlobalRoles(u.KeycloakID)
	if err != nil {
		slog.Error("get global roles", "err", err)

		return nil, status.Error(codes.Internal, "couldn't resolve user roles")
	}
	entry := userEntryFromEnt(u)
	entry.Roles = append(entry.Roles, globalRoles...)

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

	globalRoles, err := s.enforcer.GetGlobalRoles(u.KeycloakID)
	if err != nil {
		slog.Error("get global roles", "err", err)

		return nil, status.Error(codes.Internal, "couldn't resolve user roles")
	}
	entry := userEntryFromEnt(u)
	entry.Roles = append(entry.Roles, globalRoles...)

	return &msgs.WhoAmIResponse{User: entry}, nil
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
		if existing.Username != username || existing.DisplayName != displayName ||
			existing.Email != email {
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

// DeleteAccount removes the CALLER's own platform profile (GDPR self-service).
//
// Semantics pinned here, since the recipe asked for them:
//   - the platform profile row and every casbin role (g and g2) go;
//   - participation rows go with it, so the person disappears from rosters —
//     ent's Restrict edges would otherwise block the delete anyway;
//   - the KEYCLOAK identity is untouched. This service does not own it, and
//     leaving it means the person can sign in again and start fresh rather
//     than being locked out of an account they cannot recreate.
//
// Content they authored (pages, projects, submissions) is NOT deleted: those
// edges are Restrict, and silently removing an event's content because an
// author left would damage other people's records. A profile holding such
// content therefore fails with FailedPrecondition rather than cascading.
func (s *UserService) DeleteAccount(
	ctx context.Context,
	_ *msgs.DeleteAccountRequest,
) (*msgs.DeleteAccountResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	if uid == m.AnonSubject {
		return nil, status.Error(codes.Unauthenticated, "authentication required")
	}

	u, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			// Already gone: deleting twice is not an error, the caller's
			// intent already holds.
			return &msgs.DeleteAccountResponse{}, nil
		}
		slog.Error("query user for deletion", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Participation rows first: they are the expected reason a delete would
	// be blocked, and removing them is exactly what leaving means.
	if _, err := s.dbClient.Participant.Delete().
		Where(entparticipant.HasUserWith(entuser.IDEQ(u.ID))).
		Exec(ctx); err != nil {
		slog.Error("delete participations", "err", err)

		return nil, status.Error(codes.Internal, "couldn't remove participations")
	}

	if err := s.dbClient.User.DeleteOne(u).Exec(ctx); err != nil {
		if ent.IsConstraintError(err) {
			return nil, status.Error(
				codes.FailedPrecondition,
				"this profile still owns content (pages, projects or submissions); an organizer must reassign or remove it first",
			)
		}
		slog.Error("delete user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't delete profile")
	}

	// Roles last: if this failed after the row is gone, a stale grouping row
	// would silently re-grant access to whoever next registers this subject.
	if err := s.enforcer.PurgeUserRoles(uid); err != nil {
		slog.Error("purge casbin roles after account deletion", "err", err, "sub", uid)

		return nil, status.Error(codes.Internal, "couldn't purge roles")
	}

	return &msgs.DeleteAccountResponse{}, nil
}
