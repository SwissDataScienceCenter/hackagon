package middleware

import (
	"context"

	"github.com/casbin/casbin/v3"
	entadapter "github.com/casbin/ent-adapter"
	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
)

type ObjectType int

const (
	Hackathon ObjectType = iota
	Team
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
)

var permissionName = map[Permission]string{
	Read:  "read",
	Write: "write",
}

func (p Permission) String() string {
	return permissionName[p]
}

type Enforcer struct {
	enforcer *casbin.Enforcer
}

func NewRBACEnforcer(cfg *config.Config) (*Enforcer, error) {
	a, _ := entadapter.NewAdapter("postgres", cfg.ConnectionStr())
	e, _ := casbin.NewEnforcer("data/test/config/casbin_model.conf", a)

	// Load the policy from DB.
	err := e.LoadPolicy()
	if err != nil {
		return nil, err
	}

	if _, err = e.AddRoleForUser(cfg.Server.AdminEmail, "admin"); err != nil {
		return nil, err
	}

	// Save the policy back to DB.
	if err = e.SavePolicy(); err != nil {
		return nil, err
	}

	return &Enforcer{enforcer: e}, nil
}

func (e *Enforcer) Enforce(ctx context.Context, hackathonId string, object ObjectType, permission Permission) (bool, error) {
	sub, err := GetSubject(ctx)
	if err != nil {
		return false, err
	}

	return e.enforcer.Enforce(sub, hackathonId, object.String(), permission.String())
}
