package service

import (
	"context"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entformresponse "github.com/swissdatasciencecenter/hackagon/components/backend/ent/formresponse"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	entvote "github.com/swissdatasciencecenter/hackagon/components/backend/ent/vote"
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

// syncFromKeycloak refreshes the fields the identity provider owns.
//
// Deliberately NOT display_name. Keycloak owns the credentials — username and
// email are re-read from the token on every request, so the platform must not
// let anyone edit them here: the next page load would silently revert it.
// The display name is the platform's own, seeded from Keycloak when the
// profile is first created (Register) and editable afterwards via EditProfile.
// Re-syncing it on every WhoAmI is what made the account page read-only in
// practice, whatever the UI offered.
//
// Empty display names are still backfilled: a profile created before this rule
// (or by a Keycloak account with no name set) would otherwise stay blank
// forever, and a nameless user is worse than a stale one.
func syncFromKeycloak(
	ctx context.Context,
	u *ent.User,
	claims map[string]interface{},
	sub string,
) (*ent.User, error) {
	wantUsername := m.UsernameFromClaims(claims, sub)
	wantEmail := m.EmailFromClaims(claims)
	backfillName := u.DisplayName == "" && m.DisplayNameFromClaims(claims) != ""

	if u.Username == wantUsername && u.Email == wantEmail && !backfillName {
		return u, nil
	}

	upd := u.Update().SetUsername(wantUsername).SetEmail(wantEmail)
	if backfillName {
		upd = upd.SetDisplayName(m.DisplayNameFromClaims(claims))
	}

	updated, err := upd.Save(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "sync user profile: %v", err)
	}

	return updated, nil
}

// EditProfile updates the caller's own profile. There is no user id in the
// request, so this cannot reach another account — no casbin check is needed
// beyond having a subject at all.
func (s *UserService) EditProfile(
	ctx context.Context,
	req *msgs.EditProfileRequest,
) (*msgs.EditProfileResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	u, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(sub)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Error(codes.NotFound, "user not registered on platform")
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	upd := u.Update()
	if req.DisplayName != nil {
		// Trimmed because a name of spaces renders as a blank byline
		// everywhere the platform shows an author.
		name := strings.TrimSpace(req.GetDisplayName())
		if name == "" {
			return nil, status.Error(codes.InvalidArgument, "display_name cannot be blank")
		}
		upd = upd.SetDisplayName(name)
	}

	u, err = upd.Save(ctx)
	if err != nil {
		slog.Error("update user profile", "err", err)

		return nil, status.Error(codes.Internal, "couldn't update profile")
	}

	globalRoles, err := s.enforcer.GetGlobalRoles(u.KeycloakID)
	if err != nil {
		slog.Error("get global roles", "err", err)

		return nil, status.Error(codes.Internal, "couldn't resolve user roles")
	}
	entry := userEntryFromEnt(u)
	entry.Roles = append(entry.Roles, globalRoles...)

	return &msgs.EditProfileResponse{User: entry}, nil
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
	// Roles come from casbin, like Get and WhoAmI do. Without them the user
	// admin cannot answer the one question it exists for — who has global
	// rights — and the caller has no other RPC to ask, since Get is per-user.
	// The lookup is in-memory (the policy is already loaded), so it costs a map
	// read per row rather than a query.
	entries := make([]*ents.User, 0, len(users))
	for _, u := range users {
		entry := userEntryFromEnt(u)
		globalRoles, err := s.enforcer.GetGlobalRoles(u.KeycloakID)
		if err != nil {
			slog.Error("get global roles", "err", err, "user", u.KeycloakID)

			return nil, status.Error(codes.Internal, "couldn't resolve user roles")
		}
		entry.Roles = append(entry.Roles, globalRoles...)
		entries = append(entries, entry)
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

	u, err = syncFromKeycloak(ctx, u, claims, sub)
	if err != nil {
		return nil, err
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
	// syncing the Keycloak-owned fields if they changed.
	existing, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err == nil {
		existing, err = syncFromKeycloak(ctx, existing, claims, sub)
		if err != nil {
			return nil, err
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

	// The person's OWN data goes with them. The line drawn here: anything that
	// is a record *about this user* is theirs to erase (roster rows, the
	// registration answers they gave about themselves, their ballots, their
	// project preferences, their seats and jury assignments). Content they
	// AUTHORED for other people — pages, projects, submissions, tracks — is
	// Restrict-guarded below and blocks instead, because deleting an event's
	// content when a contributor leaves would damage other people's records.
	if _, err := s.dbClient.Participant.Delete().
		Where(entparticipant.HasUserWith(entuser.IDEQ(u.ID))).
		Exec(ctx); err != nil {
		slog.Error("delete participations", "err", err)

		return nil, status.Error(codes.Internal, "couldn't remove participations")
	}
	// Registration answers are personal data by definition — affiliation,
	// dietary needs, consents. Keeping them after erasing the profile is
	// exactly what a deletion request forbids.
	if _, err := s.dbClient.FormResponse.Delete().
		Where(entformresponse.HasUserWith(entuser.IDEQ(u.ID))).
		Exec(ctx); err != nil {
		slog.Error("delete form responses", "err", err)

		return nil, status.Error(codes.Internal, "couldn't remove form responses")
	}
	// Ballots identify their voter, so they cannot outlive the voter. This
	// does change tallies — the alternative is retaining an identified vote
	// for someone who asked to be erased.
	if _, err := s.dbClient.Vote.Delete().
		Where(entvote.HasVoterWith(entuser.IDEQ(u.ID))).
		Exec(ctx); err != nil {
		slog.Error("delete votes", "err", err)

		return nil, status.Error(codes.Internal, "couldn't remove votes")
	}
	// Pure link tables: clearing the edges leaves the projects, teams and
	// categories themselves untouched.
	if err := u.Update().
		ClearPreferredProjects().
		ClearParticipatesInTeams().
		ClearJuryCategories().
		Exec(ctx); err != nil {
		slog.Error("clear user memberships", "err", err)

		return nil, status.Error(codes.Internal, "couldn't clear memberships")
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
