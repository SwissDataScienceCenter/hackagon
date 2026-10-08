package service

import (
	"context"
	"log/slog"
	"net/url"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
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

	// Batch-fetch all global roles in a single casbin call.
	allRoles, err := s.enforcer.GetAllGlobalRoles()
	if err != nil {
		slog.Error("get global roles", "err", err)

		return nil, status.Error(codes.Internal, "couldn't resolve user roles")
	}

	entries := make([]*ents.User, 0, len(users))
	for _, u := range users {
		entry := userEntryFromEnt(u)
		entry.Roles = allRoles[u.KeycloakID]
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

func (s *UserService) AddRole(
	ctx context.Context,
	req *msgs.AddRoleRequest,
) (*msgs.AddRoleResponse, error) {
	if _, _, err := m.RequireSubject(ctx); err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(ctx, "", m.User, m.Write); err != nil {
		return nil, err
	}

	targetID, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	u, err := s.dbClient.User.Query().Where(entuser.IDEQ(targetID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", req.GetUserId())
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	role, ok := protoRoleToCasbin(req.GetRole())
	if !ok {
		return nil, status.Errorf(codes.InvalidArgument, "invalid role: %v", req.GetRole())
	}

	if _, err := s.enforcer.AddGlobalRole(u.KeycloakID, role); err != nil {
		slog.Error("add global role", "err", err)

		return nil, status.Error(codes.Internal, "couldn't assign role")
	}

	globalRoles, err := s.enforcer.GetGlobalRoles(u.KeycloakID)
	if err != nil {
		slog.Error("get global roles", "err", err)

		return nil, status.Error(codes.Internal, "couldn't resolve user roles")
	}
	entry := userEntryFromEnt(u)
	entry.Roles = append(entry.Roles, globalRoles...)

	return &msgs.AddRoleResponse{User: entry}, nil
}

func (s *UserService) RemoveRole(
	ctx context.Context,
	req *msgs.RemoveRoleRequest,
) (*msgs.RemoveRoleResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(ctx, "", m.User, m.Write); err != nil {
		return nil, err
	}

	targetID, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	u, err := s.dbClient.User.Query().Where(entuser.IDEQ(targetID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", req.GetUserId())
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	role, ok := protoRoleToCasbin(req.GetRole())
	if !ok {
		return nil, status.Errorf(codes.InvalidArgument, "invalid role: %v", req.GetRole())
	}

	// Prevent a user from removing their own admin role.
	if uid == u.KeycloakID && role == m.Admin {
		return nil, status.Error(codes.PermissionDenied, "cannot remove your own admin role")
	}

	// Idempotent: casbin silently no-ops if the policy doesn't exist.
	_, err = s.enforcer.RemoveGlobalRole(u.KeycloakID, role)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "couldn't remove user roles: %v", err)
	}

	globalRoles, err := s.enforcer.GetGlobalRoles(u.KeycloakID)
	if err != nil {
		slog.Error("get global roles", "err", err)

		return nil, status.Error(codes.Internal, "couldn't resolve user roles")
	}
	entry := userEntryFromEnt(u)
	entry.Roles = append(entry.Roles, globalRoles...)

	return &msgs.RemoveRoleResponse{User: entry}, nil
}

// protoRoleToCasbin converts a proto GlobalRole enum to a casbin Role.
// Returns false if the proto value is unrecognized or unspecified.
func protoRoleToCasbin(r ents.GlobalRole) (m.Role, bool) {
	switch r {
	case ents.GlobalRole_GLOBAL_ROLE_ADMIN:
		return m.Admin, true
	case ents.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER:
		return m.HackathonOrganizer, true
	case ents.GlobalRole_GLOBAL_ROLE_UNSPECIFIED:
		return 0, false
	default:
		return 0, false
	}
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

// EditProfile updates the caller's own profile links. The request names no
// user: the target is always the token's subject, so nobody can edit anyone
// else's profile.
func (s *UserService) EditProfile(
	ctx context.Context,
	req *msgs.EditProfileRequest,
) (*msgs.EditProfileResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	// The write rule is a wildcard, which the anonymous subject also matches.
	if sub == m.AnonSubject {
		return nil, status.Error(codes.Unauthenticated, "sign in to edit your profile")
	}
	if err := s.enforcer.RequirePermission(ctx, "", m.User, m.Write, m.WithUser(sub)); err != nil {
		return nil, err
	}

	u, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Error(codes.NotFound, "user not registered on platform")
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	update := u.Update()
	if req.GithubUrl != nil {
		v, err := checkProfileURL("github_url", req.GetGithubUrl(), githubProfile())
		if err != nil {
			return nil, err
		}
		update.SetGithubURL(v)
	}
	if req.RenkuUrl != nil {
		v, err := checkProfileURL("renku_url", req.GetRenkuUrl(), renkuProfile())
		if err != nil {
			return nil, err
		}
		update.SetRenkuURL(v)
	}
	if req.LinkedinUrl != nil {
		v, err := checkProfileURL("linkedin_url", req.GetLinkedinUrl(), linkedinProfile())
		if err != nil {
			return nil, err
		}
		update.SetLinkedinURL(v)
	}
	u, err = update.Save(ctx)
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

// maxProfileURLLength bounds a profile link; real ones are far shorter.
const maxProfileURLLength = 512

// profileSite says what a link to one site's profile page looks like. A nil
// host or path accepts any.
type profileSite struct {
	host    func(host string) bool
	path    *regexp.Regexp
	example string
}

func githubProfile() profileSite {
	return profileSite{
		host: func(h string) bool { return h == "github.com" || h == "www.github.com" },
		// GitHub usernames: alphanumerics and single hyphens, at most 39 long.
		path:    regexp.MustCompile(`^/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/?$`),
		example: "https://github.com/<username>",
	}
}

func linkedinProfile() profileSite {
	return profileSite{
		// Country subdomains such as ch.linkedin.com serve the same profiles.
		host:    func(h string) bool { return h == "linkedin.com" || strings.HasSuffix(h, ".linkedin.com") },
		path:    regexp.MustCompile(`^/in/[^/]+/?$`),
		example: "https://www.linkedin.com/in/<name>",
	}
}

// renkuProfile accepts any https address: Renku runs on more than one host
// (renkulab.io and self-hosted deployments).
func renkuProfile() profileSite {
	return profileSite{
		host:    nil,
		path:    nil,
		example: "https://renkulab.io/...",
	}
}

// checkProfileURL validates one profile link and returns it trimmed. Empty
// clears the link. Links are shown to other participants as clickable, so
// only https addresses to the expected site are accepted.
func checkProfileURL(field, raw string, site profileSite) (string, error) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return "", nil
	}
	if len(v) > maxProfileURLLength {
		return "", status.Errorf(codes.InvalidArgument,
			"%s: longer than %d characters", field, maxProfileURLLength)
	}
	u, err := url.Parse(v)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil {
		return "", status.Errorf(codes.InvalidArgument,
			"%s: must be an https:// address, like %s", field, site.example)
	}
	host := strings.ToLower(u.Hostname())
	if (site.host != nil && !site.host(host)) ||
		(site.path != nil && !site.path.MatchString(u.Path)) {
		return "", status.Errorf(codes.InvalidArgument,
			"%s: must look like %s", field, site.example)
	}

	return v, nil
}
