package middleware

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log/slog"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
	entadapter "github.com/casbin/ent-adapter"
	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	userEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

//go:embed casbin_model.conf
var modelFile string

const minPolicyFields = 2 // casbin policy tuples have at least 2 fields: subject and role

type Role int

const (
	Admin Role = iota
	HackathonOrganizer
	Owner
	Member
)

func (r Role) String() string {
	switch r {
	case Admin:
		return "admin"
	case HackathonOrganizer:
		return "hackathon_organizer"
	case Owner:
		return "owner"
	case Member:
		return "member"
	default:
		return ""
	}
}

type ObjectType int

const (
	Hackathon ObjectType = iota
	Page
	Team
	// Note: this is a dummy entry, there are no rules for users, since we only use admin checks with users.
	// This is just here so we have something we can query on when checking admin permissions for the user table.
	User
)

func (ot ObjectType) String() string {
	switch ot {
	case Hackathon:
		return "hackathon"
	case Team:
		return "team"
	case User:
		return "user"
	default:
		return ""
	}
}

type Permission int

const (
	Read Permission = iota
	Write
	Create
)

func (p Permission) String() string {
	switch p {
	case Read:
		return "read"
	case Write:
		return "write"
	case Create:
		return "create"
	default:
		return ""
	}
}

type Enforcer struct {
	enforcer *casbin.Enforcer
}

func NewRBACEnforcer(cfg *config.Config) (*Enforcer, error) {
	a, err := entadapter.NewAdapter(cfg.Database.Driver, cfg.ConnectionStr())
	if err != nil {
		return nil, fmt.Errorf("failed to create adapter: %w", err)
	}

	m, err := model.NewModelFromString(modelFile)
	if err != nil {
		return nil, fmt.Errorf("failed to load model config: %w", err)
	}

	e, err := casbin.NewEnforcer(m, a)
	if err != nil {
		return nil, fmt.Errorf("failed to create enforcer: %w", err)
	}

	// Load the policy from DB.
	err = e.LoadPolicy()
	if err != nil {
		return nil, err
	}

	if err = defaultPolicies(cfg, e); err != nil {
		return nil, err
	}

	// Save the policy back to DB.
	if err = e.SavePolicy(); err != nil {
		return nil, err
	}

	return &Enforcer{enforcer: e}, nil
}

func defaultPolicies(cfg *config.Config, e *casbin.Enforcer) error {
	policies := [][]string{
		// HackathonOrganizer can create new hackathons
		{HackathonOrganizer.String(), "*", Hackathon.String(), Create.String()},
		// Owner can read owned hackathon
		{Owner.String(), "*", Hackathon.String(), Read.String()},
		// Owner can write owned hackathon
		{Owner.String(), "*", Hackathon.String(), Write.String()},
		// Owner can write owned hackathon pages
		{Owner.String(), "*", Page.String(), Write.String()},
		// Owner can write owned hackathon pages
		{Owner.String(), "*", Page.String(), Read.String()},
		// Member can read joined hackathon
		{Member.String(), "*", Hackathon.String(), Read.String()},
		// Owner can write owned hackathon pages
		{Member.String(), "*", Page.String(), Read.String()},
	}
	if _, err := e.AddPolicies(policies); err != nil {
		return fmt.Errorf("couldn't load grouping policies: %w", err)
	}

	if _, err := e.AddNamedGroupingPolicy("g2", []string{cfg.Server.AdminKeycloakID, "admin"}); err != nil {
		return fmt.Errorf("couldn't add default admin: %w", err)
	}

	return nil
}

func (e *Enforcer) AddRole(user, role, hackathonId string) (bool, error) {
	return e.enforcer.AddGroupingPolicy(user, role, hackathonId)
}

func (e *Enforcer) RemoveRole(user, role, hackathonId string) (bool, error) {
	return e.enforcer.RemoveGroupingPolicy(user, role, hackathonId)
}

func (e *Enforcer) AddGlobalRole(user, role string) (bool, error) {
	return e.enforcer.AddNamedGroupingPolicy("g2", user, role)
}

func (e *Enforcer) AllowPublicHackathonAccess(hackathonId string) (bool, error) {
	return e.enforcer.AddPolicy("*", hackathonId, Hackathon.String(), Read.String())
}

func (e *Enforcer) RemovePublicHackathonAccess(hackathonId string) (bool, error) {
	return e.enforcer.RemovePolicy("*", hackathonId, Hackathon.String(), Read.String())
}

// CheckPermission checks if the given subject has permission for the given hackathon, object, and action.
// This is a low-level method that doesn't require a JWT token in the context.
func (e *Enforcer) CheckPermission(
	subject, hackathonId string, object ObjectType, permission Permission,
) (bool, error) {
	return e.enforcer.Enforce(subject, hackathonId, object.String(), permission.String())
}

// ListG2Policies returns all g2 policies in the enforcer for debugging.
func (e *Enforcer) ListG2Policies() ([][]string, error) {
	return e.enforcer.GetFilteredNamedGroupingPolicy("g2", 0)
}

// GetHackathonRole returns the highest-priority casbin role for keycloakID in hackathonID.
// Owner takes precedence over Member regardless of slice order — casbin does not sort roles.
// Global admin/organizer roles (g2) are not surfaced here — the enum only has OWNER and MEMBER.
func (e *Enforcer) GetHackathonRole(
	keycloakID, hackathonID string,
) (hackEnts.HackathonRole, error) {
	roles, err := e.enforcer.GetRolesForUser(keycloakID, hackathonID)
	if err != nil {
		slog.Error(
			"get roles for user",
			"keycloak_id",
			keycloakID,
			"hackathon_id",
			hackathonID,
			"err",
			err,
		)

		return hackEnts.HackathonRole_HACKATHON_ROLE_UNSPECIFIED, err
	}

	roleSet := make(map[string]bool, len(roles))
	for _, r := range roles {
		roleSet[r] = true
	}

	switch {
	case roleSet[Owner.String()]:
		return hackEnts.HackathonRole_HACKATHON_ROLE_OWNER, nil
	case roleSet[Member.String()]:
		return hackEnts.HackathonRole_HACKATHON_ROLE_MEMBER, nil
	default:
		return hackEnts.HackathonRole_HACKATHON_ROLE_UNSPECIFIED, nil
	}
}

func (e *Enforcer) Enforce(
	ctx context.Context,
	hackathonId string,
	object ObjectType,
	permission Permission,
) (bool, error) {
	claims, ok := GetClaims(ctx)
	if !ok {
		return false, errors.New("no claims in context")
	}
	sub, err := claims.GetSubject()
	if err != nil {
		return false, err
	}

	return e.enforcer.Enforce(sub, hackathonId, object.String(), permission.String())
}

// GetGlobalRoles returns the g2 (global) casbin roles for the given Keycloak ID as typed enums.
// Subject must be the Keycloak ID. Unrecognized role strings are silently skipped.
func (e *Enforcer) GetGlobalRoles(keycloakID string) ([]userEnts.GlobalRole, error) {
	policies, err := e.enforcer.GetFilteredNamedGroupingPolicy("g2", 0, keycloakID)
	if err != nil {
		return nil, err
	}
	roles := make([]userEnts.GlobalRole, 0, len(policies))
	for _, p := range policies {
		if len(
			p,
		) < minPolicyFields {
			continue
		}
		switch p[1] {
		case Admin.String():
			roles = append(roles, userEnts.GlobalRole_GLOBAL_ROLE_ADMIN)
		case HackathonOrganizer.String():
			roles = append(roles, userEnts.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER)
		}
	}

	return roles, nil
}

// RequirePermission enforces a permission check and returns a gRPC-ready error if denied.
// Use this in handlers instead of calling Enforce directly.
func (e *Enforcer) RequirePermission(
	ctx context.Context,
	hackathonId string,
	object ObjectType,
	permission Permission,
) error {
	ok, err := e.Enforce(ctx, hackathonId, object, permission)
	if err != nil {
		slog.Error("enforce permission", "err", err)

		return status.Error(codes.Internal, "authorization error")
	}
	if !ok {
		return status.Error(codes.PermissionDenied, "permission denied")
	}

	return nil
}
