package middleware

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"slices"
	"strings"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/log"
	"github.com/casbin/casbin/v3/model"
	"github.com/casbin/casbin/v3/util"
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
	Phase
	Track
	Project
	Team
	Submission
	Vote
	VoteCategory
	VoteResult
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
	case Vote:
		return "vote"
	case VoteCategory:
		return "vote_category"
	case VoteResult:
		return "vote_result"
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
	Join
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
	case Join:
		return "join"
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

	// Register hierarchical domain matching for both g role lookups and the
	// matcher. A request to /hackathon/h1/team/t1 matches a policy on
	// /hackathon/h1 (and any glob pattern under it).
	e.AddFunction("hasRoleInDomainOrAncestor", domainMatch(e))
	return &Enforcer{enforcer: e}, nil
}
func parentDomain(domain string) string {
	if domain == "" || domain == "/" {
		return ""
	}
	domain = strings.Trim(domain, "/")
	parts := strings.Split(domain, "/")
	numPartsPerDomainSection := 2
	if len(parts) <= numPartsPerDomainSection {
		return ""
	}
	return "/" + strings.Join(parts[:len(parts)-numPartsPerDomainSection], "/")
}

func hasRoleInDomain(e *casbin.Enforcer, sub, role, domain string) bool {
	roles := e.GetRolesForUserInDomain(sub, domain)
	return slices.Contains(roles, role)
}
func domainMatch(e *casbin.Enforcer) func(args ...interface{}) (interface{}, error) {
	return func(args ...interface{}) (interface{}, error) {
		sub, ok := args[0].(string)
		if !ok {
			return nil, fmt.Errorf("could not convert sub to string: %v", sub)
		}
		role, ok := args[1].(string)
		if !ok {
			return nil, fmt.Errorf("could not convert role to string: %v", sub)
		}
		requestDomain, ok := args[2].(string)
		if !ok {
			return nil, fmt.Errorf("could not convert requestDomain to string: %v", sub)
		}
		policyDomain, ok := args[3].(string)
		if !ok {
			return nil, fmt.Errorf("could not convert policyDomain to string: %v", sub)
		}

		for d := requestDomain; d != ""; d = parentDomain(d) {
			matched, err := util.GlobMatch(d, policyDomain)
			if err != nil {
				return false, err
			}
			if !matched {
				continue
			}
			if role == "*" || hasRoleInDomain(e, sub, role, d) {
				return true, nil
			}
		}
		return false, nil
	}
}
func defaultPolicies(cfg *config.Config, e *casbin.Enforcer) error {
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
		// Owner can propose owned hackathon projects
		{Owner.String(), "/hackathon/*", Project.String(), Propose.String()},
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
		// Owner can create teams
		{Owner.String(), "/hackathon/*", Team.String(), Create.String()},
		// Owner can read teams
		{Owner.String(), "/hackathon/*", Team.String(), Read.String()},
		// Owner can edit teams
		{Owner.String(), "/hackathon/*", Team.String(), Write.String()},
		// Team member can edit team
		{Member.String(), "/hackathon/*/team/*", Team.String(), Write.String()},
		// Team member can edit a submission
		{Member.String(), "/hackathon/*/team/*", Submission.String(), Write.String()},
		// Team member can read a submission
		{Member.String(), "/hackathon/*/team/*", Submission.String(), Read.String()},
		// Hackathon owner can read a submission
		{Owner.String(), "/hackathon/*", Submission.String(), Read.String()},
		// Owner can manage vote categories
		{Owner.String(), "/hackathon/*", VoteCategory.String(), Create.String()},
		{Owner.String(), "/hackathon/*", VoteCategory.String(), Read.String()},
		{Owner.String(), "/hackathon/*", VoteCategory.String(), Write.String()},
		// Owner can manage vote results
		{Owner.String(), "/hackathon/*", VoteResult.String(), Create.String()},
		{Owner.String(), "/hackathon/*", VoteResult.String(), Read.String()},
		{Owner.String(), "/hackathon/*", VoteResult.String(), Write.String()},
		{Owner.String(), "/hackathon/*", Vote.String(), Read.String()},
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

func (e *Enforcer) AddRoleBatch(
	users []string,
	role Role,
	hackathonId string,
	opts ...EnforceOption,
) (bool, error) {
	domain := enforceOptsToPath(hackathonId, opts...)
	policies := make([][]string, 0, len(users))
	for _, user := range users {
		policies = append(policies, []string{user, role.String(), domain})
	}

	return e.enforcer.AddGroupingPolicies(policies)
}

func (e *Enforcer) RemoveRoleBatch(
	users []string,
	role Role,
	hackathonId string,
	opts ...EnforceOption,
) (bool, error) {
	domain := enforceOptsToPath(hackathonId, opts...)
	policies := make([][]string, 0, len(users))
	for _, user := range users {
		policies = append(policies, []string{user, role.String(), domain})
	}

	return e.enforcer.RemoveGroupingPolicies(policies)
}

func (e *Enforcer) AddGlobalRole(user string, role Role) (bool, error) {
	return e.enforcer.AddNamedGroupingPolicy("g2", user, role.String())
}

func (e *Enforcer) RemoveGlobalRole(user string, role Role) (bool, error) {
	return e.enforcer.RemoveNamedGroupingPolicy("g2", user, role.String())
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

func (e *Enforcer) AddPolicy(
	role *Role,
	hackathonId string,
	obj ObjectType,
	perm Permission,
	opts ...EnforceOption,
) error {
	var actualRole string
	if role == nil {
		actualRole = "*"
	} else {
		actualRole = role.String()
	}
	domain := enforceOptsToPath(hackathonId, opts...)
	_, err := e.enforcer.AddPolicy(actualRole, domain, obj.String(), perm.String())
	return err
}

func (e *Enforcer) RemovePolicy(
	role *Role,
	hackathonId string,
	obj ObjectType,
	perm Permission,
	opts ...EnforceOption,
) error {
	var actualRole string
	if role == nil {
		actualRole = "*"
	} else {
		actualRole = role.String()
	}
	domain := enforceOptsToPath(hackathonId, opts...)
	_, err := e.enforcer.RemovePolicy(actualRole, domain, obj.String(), perm.String())
	return err
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
	return globalRolesFromPolicies(policies), nil
}

// GetAllGlobalRoles returns all g2 policies as a map of Keycloak ID → roles.
// Single casbin call — use for batch lookups (e.g. List endpoints).
func (e *Enforcer) GetAllGlobalRoles() (map[string][]userEnts.GlobalRole, error) {
	policies, err := e.enforcer.GetFilteredNamedGroupingPolicy("g2", 0)
	if err != nil {
		return nil, err
	}
	m := make(map[string][]userEnts.GlobalRole)
	for _, p := range policies {
		if len(p) < minPolicyFields {
			continue
		}
		keycloakID := p[0]
		roles := globalRolesFromPolicies([][]string{p})
		m[keycloakID] = append(m[keycloakID], roles...)
	}
	return m, nil
}

// globalRolesFromPolicies converts raw casbin policy rows to typed GlobalRole enums.
func globalRolesFromPolicies(policies [][]string) []userEnts.GlobalRole {
	roles := make([]userEnts.GlobalRole, 0, len(policies))
	for _, p := range policies {
		if len(p) < minPolicyFields {
			continue
		}
		switch p[1] {
		case Admin.String():
			roles = append(roles, userEnts.GlobalRole_GLOBAL_ROLE_ADMIN)
		case HackathonOrganizer.String():
			roles = append(roles, userEnts.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER)
		}
	}
	return roles
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
		return status.Error(codes.PermissionDenied, "permission denied")
	}

	return nil
}
