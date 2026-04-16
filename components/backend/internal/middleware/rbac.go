package middleware

import (
	"github.com/casbin/casbin/v3"
	entadapter "github.com/casbin/ent-adapter"
	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
)

func NewRBACEnforcer(cfg *config.Config) (*casbin.Enforcer, error) {
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

	return e, nil
}
