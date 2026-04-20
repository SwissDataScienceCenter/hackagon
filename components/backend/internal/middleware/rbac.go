package middleware

import (
	"context"
	_ "embed"
	"fmt"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
	entadapter "github.com/casbin/ent-adapter"
	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
)

//go:embed casbin_model.conf
var modelFile string

type Role int

const (
	Admin Role = iota
	HackathonOrganizer
	Owner
	Member
)

var roleName = map[Role]string{
	Admin:              "admin",
	HackathonOrganizer: "hackathon_organizer",
	Owner:              "owner",
	Member:             "member",
}

func (r Role) String() string {
	return roleName[r]
}

type ObjectType int

const (
	Hackathon ObjectType = iota
	Team
	// Note: this is a dummy entry, there are no rules for users, since we only use admin checks with users.
	// This is just here so we have something we can query on when checking admin permissions for the user table.
	User
)

var objectName = map[ObjectType]string{
	Hackathon: "hackathon",
	Team:      "team",
	User:      "user",
}

func (ot ObjectType) String() string {
	return objectName[ot]
}

type Permission int

const (
	Read Permission = iota
	Write
	Create
)

var permissionName = map[Permission]string{
	Create: "create",
	Read:   "read",
	Write:  "write",
}

func (p Permission) String() string {
	return permissionName[p]
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
		// Member can read joined hackathon
		{Member.String(), "*", Hackathon.String(), Read.String()},
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

func (e *Enforcer) Enforce(
	ctx context.Context,
	hackathonId string,
	object ObjectType,
	permission Permission,
) (bool, error) {
	sub, err := GetSubject(ctx)
	if err != nil {
		return false, err
	}

	return e.enforcer.Enforce(sub, hackathonId, object.String(), permission.String())
}
