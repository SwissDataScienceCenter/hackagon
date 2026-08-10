package middleware

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log/slog"
	"os"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/log"
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

// ErrNotAGlobalRole is returned when a hackathon-scoped role is granted globally.
var ErrNotAGlobalRole = errors.New("role cannot be granted globally")

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
	Phase
	Track
	Project
	Team
	Submission
	// Note: this is a dummy entry, there are no rules for users, since we only use admin checks with users.
	// This is just here so we have something we can query on when checking admin permissions for the user table.
	User
)

func (ot ObjectType) String() string {
	switch ot {
	case Hackathon:
		return "hackathon"
	case Page:
		return "page"
	case Phase:
		return "phase"
	case Track:
		return "track"
	case Project:
		return "project"
	case Team:
		return "team"
	case Submission:
		return "submission"
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
	Propose
)

func (p Permission) String() string {
	switch p {
	case Read:
		return "read"
	case Write:
		return "write"
	case Create:
		return "create"
	case Propose:
		return "propose"
	default:
		return ""
	}
}

// Enforcer wraps a casbin.SyncedEnforcer — synced, not plain, because gRPC
// handlers run concurrently and casbin's in-memory model is not safe for a
// policy write (Join's AddRole, owner grants) racing an Enforce read. The
// synced variant takes an RWMutex around both. Check-then-act sequences that
// span SEVERAL casbin calls (the last-organizer guard) still need their own
// lock on top; see HackathonService.ownerMu.
type Enforcer struct {
	enforcer *casbin.SyncedEnforcer
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

	e, err := casbin.NewSyncedEnforcer(m, a)
	if err != nil {
		return nil, fmt.Errorf("failed to create enforcer: %w", err)
	}
	if cfg.Logging.Level == "debug" {
		l := log.NewDefaultLogger()
		l.SetOutput(os.Stderr)
		e.SetLogger(l)
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

func defaultPolicies(cfg *config.Config, e *casbin.SyncedEnforcer) error {
	policies := [][]string{
		// HackathonOrganizer can create new hackathons
		{HackathonOrganizer.String(), "/hackathon/*", Hackathon.String(), Create.String()},
		// Owner can read owned hackathon
		{Owner.String(), "/hackathon/*", Hackathon.String(), Read.String()},
		// Owner can write owned hackathon
		{Owner.String(), "/hackathon/*", Hackathon.String(), Write.String()},
		// Owner can write owned hackathon pages
		{Owner.String(), "/hackathon/*", Page.String(), Write.String()},
		// Owner can write owned hackathon pages
		{Owner.String(), "/hackathon/*", Page.String(), Read.String()},
		// Owner can write owned hackathon phases
		{Owner.String(), "/hackathon/*", Phase.String(), Write.String()},
		// Owner can write owned hackathon phases
		{Owner.String(), "/hackathon/*", Phase.String(), Read.String()},
		// Owner can write owned hackathon tracks
		{Owner.String(), "/hackathon/*", Track.String(), Write.String()},
		// Owner can read owned hackathon tracks
		{Owner.String(), "/hackathon/*", Track.String(), Read.String()},
		// Owner can write owned hackathon projects
		{Owner.String(), "/hackathon/*", Project.String(), Write.String()},
		// Project Owner can write owned  project
		{Owner.String(), "/hackathon/*/project/*", Project.String(), Write.String()},
		// Owner can read owned hackathon projects
		{Owner.String(), "/hackathon/*", Project.String(), Read.String()},
		// Owner can propose new projects
		{Owner.String(), "/hackathon/*", Project.String(), Propose.String()},
		// Member can propose new projects
		{Member.String(), "/hackathon/*", Project.String(), Propose.String()},
		// Member can read joined hackathon
		{Member.String(), "/hackathon/*", Hackathon.String(), Read.String()},
		// Member can read hackathon pages
		{Member.String(), "/hackathon/*", Page.String(), Read.String()},
		// Member can read hackathon phases
		{Member.String(), "/hackathon/*", Phase.String(), Read.String()},
		// Member can read hackathon tracks
		{Member.String(), "/hackathon/*", Track.String(), Read.String()},
		// Member can read hackathon projects
		{Member.String(), "/hackathon/*", Project.String(), Read.String()},
		// Members read every team's submissions: demo day and voting both
		// require seeing what the other teams turned in.
		{Member.String(), "/hackathon/*", Submission.String(), Read.String()},
		// Owner can create teams
		{Owner.String(), "/hackathon/*", Team.String(), Create.String()},
		// Owner can edit teams
		{Owner.String(), "/hackathon/*", Team.String(), Write.String()},
		// Team member can edit team
		{Member.String(), "/hackathon/*/team/*", Team.String(), Write.String()},
		// Team member can create a submission
		{Member.String(), "/hackathon/*/team/*", Submission.String(), Create.String()},
		// Team member can edit a submission
		{Member.String(), "/hackathon/*/team/*", Submission.String(), Write.String()},
		// Team member can read a submission
		{Member.String(), "/hackathon/*/team/*", Submission.String(), Read.String()},
		// Hackathon owner can read a submission
		{Owner.String(), "/hackathon/*", Submission.String(), Read.String()},
	}
	if _, err := e.AddPolicies(policies); err != nil {
		return fmt.Errorf("couldn't load grouping policies: %w", err)
	}

	if _, err := e.AddNamedGroupingPolicy("g2", []string{cfg.Server.AdminKeycloakID, "admin"}); err != nil {
		return fmt.Errorf("couldn't add default admin: %w", err)
	}

	return nil
}

func hackathonIdToPath(hackathonId string) string {
	return fmt.Sprintf("/hackathon/%s", hackathonId)
}

// teamDomainPath returns the full domain path for a team resource,
// e.g. /hackathon/<id>/team/<id>.
func teamDomainPath(domain, teamId string) string {
	return fmt.Sprintf("%s/team/%s", domain, teamId)
}

// projectDomainPath returns the full domain path for a project resource,
// e.g. /hackathon/<id>/project/<id>.
func projectDomainPath(domain, projectId string) string {
	return fmt.Sprintf("%s/project/%s", domain, projectId)
}

func enforceOptsToPath(hackathonId string, opts ...EnforceOption) string {
	//exhaustruct:ignore
	options := &enforceOptions{}
	for _, opt := range opts {
		opt(options)
	}

	domain := hackathonIdToPath(hackathonId)
	if options.projectID != "" {
		domain = projectDomainPath(domain, options.projectID)
	}
	if options.teamID != "" {
		domain = teamDomainPath(domain, options.teamID)
	}
	return domain
}

func (e *Enforcer) AddRole(
	user string,
	role Role,
	hackathonId string,
	opts ...EnforceOption,
) (bool, error) {
	domain := enforceOptsToPath(hackathonId, opts...)

	return e.enforcer.AddGroupingPolicy(user, role.String(), domain)
}

func (e *Enforcer) RemoveRole(
	user string,
	role Role,
	hackathonId string,
	opts ...EnforceOption,
) (bool, error) {
	domain := enforceOptsToPath(hackathonId, opts...)

	return e.enforcer.RemoveGroupingPolicy(user, role.String(), domain)
}

// IsGlobal reports whether a role is meaningful outside a single hackathon.
// Owner and Member describe a user's standing in one hackathon, so granting them
// globally is always a mistake.
func (r Role) IsGlobal() bool {
	return r == Admin || r == HackathonOrganizer
}

// AddGlobalRole grants a role to a user across all hackathons.
//
// It writes both grouping tables, because each is read by a different consumer:
//   - g2 (user, role) is what GetGlobalRoles — and therefore WhoAmI — reports.
//   - g (user, role, /hackathon/*) is what the matcher can actually enforce. The
//     model only consults g2 through the hard-coded g2(r.sub, "admin") clause, so
//     a g2 row alone leaves every role other than admin unenforceable.
//
// The g domain is the literal string "/hackathon/*", which is what handlers
// enforcing against all hackathons pass (see HackathonService.Create). No domain
// matching function is registered for g, so g lookups are exact string compares:
// this row cannot match a request scoped to a concrete /hackathon/<id>.
//
// Use AddRole for roles that belong to one hackathon.
func (e *Enforcer) AddGlobalRole(user string, role Role) (bool, error) {
	if !role.IsGlobal() {
		return false, fmt.Errorf("%w: %s is scoped to a single hackathon", ErrNotAGlobalRole, role)
	}

	if _, err := e.enforcer.AddNamedGroupingPolicy("g2", user, role.String()); err != nil {
		return false, fmt.Errorf("add global role %s for %s: %w", role, user, err)
	}

	return e.enforcer.AddGroupingPolicy(user, role.String(), hackathonIdToPath("*"))
}

// RemoveGlobalRole revokes a role granted by AddGlobalRole.
//
// Symmetric with it on purpose: AddGlobalRole writes BOTH grouping tables —
// `g2` for the global-role checks and a wildcard `g` row so per-hackathon
// policies match too — so removing only the `g2` row would leave the wildcard
// behind and the user would keep the permissions while every UI that lists
// roles showed none. That is the worst shape a permission bug can take.
//
// Idempotent: casbin no-ops on a policy that is not there, so revoking a role
// nobody holds is not an error.
func (e *Enforcer) RemoveGlobalRole(user string, role Role) (bool, error) {
	if !role.IsGlobal() {
		return false, fmt.Errorf("%w: %s is scoped to a single hackathon", ErrNotAGlobalRole, role)
	}

	if _, err := e.enforcer.RemoveNamedGroupingPolicy("g2", user, role.String()); err != nil {
		return false, fmt.Errorf("remove global role %s for %s: %w", role, user, err)
	}

	return e.enforcer.RemoveGroupingPolicy(user, role.String(), hackathonIdToPath("*"))
}

func (e *Enforcer) AllowPublicHackathonAccess(hackathonId string) (bool, error) {
	return e.enforcer.AddPolicy(
		"*",
		hackathonIdToPath(hackathonId),
		Hackathon.String(),
		Read.String(),
	)
}

func (e *Enforcer) RemovePublicHackathonAccess(hackathonId string) (bool, error) {
	return e.enforcer.RemovePolicy(
		"*",
		hackathonIdToPath(hackathonId),
		Hackathon.String(),
		Read.String(),
	)
}

// CheckPermission checks if the given subject has permission for the given hackathon, object, and action.
// This is a low-level method that doesn't require a JWT token in the context.
func (e *Enforcer) CheckPermission(
	subject, hackathonId string, object ObjectType, permission Permission,
) (bool, error) {
	return e.enforcer.Enforce(
		subject,
		hackathonIdToPath(hackathonId),
		object.String(),
		permission.String(),
	)
}

// ListG2Policies returns all g2 policies in the enforcer for debugging.
func (e *Enforcer) ListG2Policies() ([][]string, error) {
	return e.enforcer.GetFilteredNamedGroupingPolicy("g2", 0)
}

// HackathonOwners returns the Keycloak IDs holding Owner in one hackathon.
//
// Exists for the last-owner guard in RemoveOwner. Ownership is a casbin fact on
// this branch — there is no owners column to count — so the only way to ask
// "would this leave the event unowned?" is to read the grouping table directly.
//
// Filters on fields 1 (role) and 2 (domain) of `g`; field 0 is the subject,
// which is what we are collecting.
func (e *Enforcer) HackathonOwners(hackathonID string) ([]string, error) {
	rows, err := e.enforcer.GetFilteredGroupingPolicy(
		1, Owner.String(), hackathonIdToPath(hackathonID),
	)
	if err != nil {
		return nil, err
	}

	owners := make([]string, 0, len(rows))
	for _, r := range rows {
		if len(r) > 0 {
			owners = append(owners, r[0])
		}
	}

	return owners, nil
}

// GetHackathonRole returns the highest-priority casbin role for keycloakID in hackathonID.
// Owner takes precedence over Member regardless of slice order — casbin does not sort roles.
// Global admin/organizer roles (g2) are not surfaced here — the enum only has OWNER and MEMBER.
func (e *Enforcer) GetHackathonRole(
	keycloakID, hackathonID string,
) (hackEnts.HackathonRole, error) {
	roles, err := e.enforcer.GetRolesForUser(keycloakID, hackathonIdToPath(hackathonID))
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

// PurgeUserRoles removes every role a user holds — per-hackathon (g) and
// global (g2) alike. Used by account deletion: leaving grouping rows behind
// would silently re-grant everything if the same Keycloak subject ever
// registered again.
func (e *Enforcer) PurgeUserRoles(keycloakID string) error {
	// Field 0 of both grouping tables is the subject.
	if _, err := e.enforcer.RemoveFilteredGroupingPolicy(0, keycloakID); err != nil {
		return err
	}
	if _, err := e.enforcer.RemoveFilteredNamedGroupingPolicy("g2", 0, keycloakID); err != nil {
		return err
	}

	return e.enforcer.SavePolicy()
}

// IsGlobalAdmin reports whether the Keycloak ID holds the global Admin role
// (casbin g2). Site-wide resources have no hackathon to scope a domain to, so
// they authorize on this directly instead of through Enforce.
func (e *Enforcer) IsGlobalAdmin(keycloakID string) (bool, error) {
	globals, err := e.GetGlobalRoles(keycloakID)
	if err != nil {
		return false, err
	}
	for _, g := range globals {
		if g == userEnts.GlobalRole_GLOBAL_ROLE_ADMIN {
			return true, nil
		}
	}

	return false, nil
}

// RequireGlobalAdmin is the site-domain counterpart to RequirePermission:
// anonymous callers are told to authenticate, everyone else who is not a
// global admin is denied.
func (e *Enforcer) RequireGlobalAdmin(ctx context.Context) error {
	uid, _, err := RequireSubject(ctx)
	if err != nil {
		return err
	}
	if uid == AnonSubject {
		return status.Error(codes.Unauthenticated, "authentication required")
	}
	ok, err := e.IsGlobalAdmin(uid)
	if err != nil {
		slog.Error("check global admin", "err", err)

		return status.Error(codes.Internal, "authorization error")
	}
	if !ok {
		return status.Error(codes.PermissionDenied, "permission denied")
	}

	return nil
}

//exhaustruct:optional
type enforceOptions struct {
	teamID    string
	projectID string
}

type EnforceOption func(*enforceOptions)

// WithTeam overrides the default /hackathon/<id> domain path to
// /hackathon/<id>/team/<teamId>. Use this for team-level operations
// so that both hackathon-owner and team-member policies can match.
func WithTeam(teamID string) EnforceOption {
	return func(o *enforceOptions) {
		o.teamID = teamID
	}
}

// WithProject overrides the default /hackathon/<id> domain path to
// /hackathon/<id>/project/<projectId>. Use this for project-level operations
// so that both hackathon-owner and project-member policies can match.
func WithProject(projectID string) EnforceOption {
	return func(o *enforceOptions) {
		o.projectID = projectID
	}
}

func (e *Enforcer) Enforce(
	ctx context.Context,
	hackathonId string,
	object ObjectType,
	permission Permission,
	opts ...EnforceOption,
) (bool, error) {
	domain := enforceOptsToPath(hackathonId, opts...)

	claims, ok := GetClaims(ctx)
	if !ok {
		return false, errors.New("no claims in context")
	}
	sub, err := claims.GetSubject()
	if err != nil {
		return false, err
	}

	return e.enforcer.Enforce(sub, domain, object.String(), permission.String())
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
// Accepts optional EnforceOption values (e.g. WithDomain) to override the default domain.
func (e *Enforcer) RequirePermission(
	ctx context.Context,
	hackathonId string,
	object ObjectType,
	permission Permission,
	opts ...EnforceOption,
) error {
	ok, err := e.Enforce(ctx, hackathonId, object, permission, opts...)
	if err != nil {
		slog.Error("enforce permission", "err", err)

		return status.Error(codes.Internal, "authorization error")
	}
	if !ok {
		// gRPC convention: anonymous callers are told to authenticate
		// (UNAUTHENTICATED), authenticated-but-unauthorized callers get
		// PERMISSION_DENIED. Matches the hand-written AnonSubject checks in
		// Join/ApproveParticipant so every endpoint speaks the same code.
		if claims, found := GetClaims(ctx); found {
			if sub, err := claims.GetSubject(); err == nil && sub == AnonSubject {
				return status.Error(codes.Unauthenticated, "authentication required")
			}
		}

		return status.Error(codes.PermissionDenied, "permission denied")
	}

	return nil
}
