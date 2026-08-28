//go:build test && unittest

package middleware

import (
	"fmt"
	"testing"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
	"github.com/casbin/casbin/v3/util"
)

func setupTestEnforcer() *casbin.Enforcer {
	m, err := model.NewModelFromString(`
[request_definition]
r = sub, domain, obj, act

[policy_definition]
p = sub, domain, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.domain) && hasRoleInDomainOrAncestor(r.sub, p.sub, r.domain, p.domain) && r.obj == p.obj && r.act == p.act
`)
	if err != nil {
		panic(err)
	}
	e, err := casbin.NewEnforcer(m)
	if err != nil {
		panic(err)
	}
	// Register the domain match function so the matcher can use it
	e.AddFunction("hasRoleInDomainOrAncestor", domainMatch(e))
	return e
}

func TestDomainMatchDebug(t *testing.T) {
	e := setupTestEnforcer()

	// Add a grouping policy
	_, err := e.AddGroupingPolicy("alice", "owner", "/hackathon/h1")
	if err != nil {
		t.Fatalf("AddGroupingPolicy failed: %v", err)
	}

	// Rebuild role links
	_ = e.BuildRoleLinks()

	// Check what GetRolesForUserInDomain returns
	roles := e.GetRolesForUserInDomain("alice", "/hackathon/h1")
	fmt.Printf("Roles for alice in /hackathon/h1: %v\n", roles)

	// Test domainMatch directly
	dm := domainMatch(e)
	result, err := dm("alice", "owner", "/hackathon/h1", "/hackathon/h1")
	fmt.Printf("domainMatch result: %v, err: %v\n", result, err)

	// Test parentDomain
	fmt.Printf("parentDomain(/hackathon/h1) = %q\n", parentDomain("/hackathon/h1"))
	fmt.Printf("parentDomain(/hackathon/h1/team/t1) = %q\n", parentDomain("/hackathon/h1/team/t1"))
}

func TestDomainMatch(t *testing.T) {
	tests := []struct {
		name          string
		sub           string
		role          string
		requestDomain string
		policyDomain  string
		policies      []string // g policies to add: "user,role,domain"
		want          bool
	}{
		// Exact match — user has role at exact domain
		{
			name:          "exact match owner",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h1",
			policyDomain:  "/hackathon/h1",
			policies:      []string{"alice", "owner", "/hackathon/h1"},
			want:          true,
		},
		{
			name:          "exact match member",
			sub:           "bob",
			role:          "member",
			requestDomain: "/hackathon/h1/team/t1",
			policyDomain:  "/hackathon/h1/team/t1",
			policies:      []string{"bob", "member", "/hackathon/h1/team/t1"},
			want:          true,
		},

		// Hierarchical — user has role at parent domain
		{
			name:          "parent domain owner",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h1/team/t1",
			policyDomain:  "/hackathon/h1",
			policies:      []string{"alice", "owner", "/hackathon/h1"},
			want:          true,
		},
		{
			name:          "grandparent domain owner",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h1/team/t1/submission/s1",
			policyDomain:  "/hackathon/h1",
			policies:      []string{"alice", "owner", "/hackathon/h1"},
			want:          true,
		},
		{
			name:          "parent domain member",
			sub:           "bob",
			role:          "member",
			requestDomain: "/hackathon/h1/team/t1",
			policyDomain:  "/hackathon/h1",
			policies:      []string{"bob", "member", "/hackathon/h1"},
			want:          true,
		},

		// Role mismatch — user has different role at ancestor
		{
			name:          "different role at parent",
			sub:           "bob",
			role:          "owner",
			requestDomain: "/hackathon/h1/team/t1",
			policyDomain:  "/hackathon/h1",
			policies:      []string{"bob", "member", "/hackathon/h1"},
			want:          false,
		},

		// No role assigned
		{
			name:          "no role assigned",
			sub:           "charlie",
			role:          "owner",
			requestDomain: "/hackathon/h1",
			policyDomain:  "/hackathon/h1",
			policies:      nil,
			want:          false,
		},

		// Cross-hackathon rejection — user has role in different hackathon
		{
			name:          "different hackathon",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h2",
			policyDomain:  "/hackathon/h1",
			policies:      []string{"alice", "owner", "/hackathon/h2"},
			want:          false,
		},
		{
			name:          "different hackathon subdomain",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h2/team/t1",
			policyDomain:  "/hackathon/h1",
			policies:      []string{"alice", "owner", "/hackathon/h2"},
			want:          false,
		},

		// Glob pattern — user has role at matching glob domain
		{
			name:          "glob wildcard match",
			sub:           "bob",
			role:          "member",
			requestDomain: "/hackathon/h1/team/t1",
			policyDomain:  "/hackathon/*/team/*",
			policies:      []string{"bob", "member", "/hackathon/*/team/*"},
			want:          true,
		},
		{
			name:          "glob wildcard deep match",
			sub:           "bob",
			role:          "member",
			requestDomain: "/hackathon/h1/team/t1/submission/s1",
			policyDomain:  "/hackathon/*/team/*",
			policies:      []string{"bob", "member", "/hackathon/*/team/*"},
			want:          true,
		},
		{
			name:          "glob wildcard project",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h1/project/p1",
			policyDomain:  "/hackathon/*/project/*",
			policies:      []string{"alice", "owner", "/hackathon/*/project/*"},
			want:          true,
		},

		// Glob pattern — no match
		{
			name:          "glob wildcard no match",
			sub:           "bob",
			role:          "member",
			requestDomain: "/hackathon/h1",
			policyDomain:  "/hackathon/*/team/*",
			policies:      []string{"bob", "member", "/hackathon/*/team/*"},
			want:          false,
		},

		// Empty strings
		{
			name:          "both empty",
			sub:           "alice",
			role:          "owner",
			requestDomain: "",
			policyDomain:  "",
			policies:      []string{"alice", "owner", ""},
			want:          true,
		},
		{
			name:          "request empty",
			sub:           "alice",
			role:          "owner",
			requestDomain: "",
			policyDomain:  "/hackathon/h1",
			policies:      []string{"alice", "owner", "/hackathon/h1"},
			want:          false,
		},
		{
			name:          "policy empty",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h1",
			policyDomain:  "",
			policies:      []string{"alice", "owner", "/hackathon/h1"},
			want:          false,
		},

		// Partial pair boundaries must NOT match
		{
			name:          "partial pair no match",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h1/team/t1",
			policyDomain:  "/hackathon/h1/team",
			policies:      []string{"alice", "owner", "/hackathon/h1/team"},
			want:          false,
		},
		{
			name:          "partial pair entity no match",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h1",
			policyDomain:  "/hackathon",
			policies:      []string{"alice", "owner", "/hackathon"},
			want:          false,
		},
		{
			name:          "partial pair entity glob no match",
			sub:           "bob",
			role:          "member",
			requestDomain: "/hackathon/h1/team/t1",
			policyDomain:  "/hackathon/*/team",
			policies:      []string{"bob", "member", "/hackathon/*/team"},
			want:          false,
		},

		// Role at team level
		{
			name:          "role at team level",
			sub:           "bob",
			role:          "member",
			requestDomain: "/hackathon/h1/team/t1",
			policyDomain:  "/hackathon/h1/team/t1",
			policies:      []string{"bob", "member", "/hackathon/h1/team/t1"},
			want:          true,
		},

		// Role at ancestor but checking at descendant — should match
		{
			name:          "ancestor role checks descendant",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h1/project/p1",
			policyDomain:  "/hackathon/h1",
			policies:      []string{"alice", "owner", "/hackathon/h1"},
			want:          true,
		},
		{
			name:          "submission read for owner",
			sub:           "alice",
			role:          "owner",
			requestDomain: "/hackathon/h1/team/t1",
			policyDomain:  "/hackathon/*",
			policies:      []string{"alice", "owner", "/hackathon/h1"},
			want:          true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := setupTestEnforcer()
			if len(tt.policies) > 0 {
				parts := make([]interface{}, 0, len(tt.policies))
				for _, pol := range tt.policies {
					parts = append(parts, pol)
				}
				_, _ = e.AddGroupingPolicy(parts...)
			}
			// Rebuild role links to pick up newly added grouping policies
			_ = e.BuildRoleLinks()

			dm := domainMatch(e)
			got, err := dm(tt.sub, tt.role, tt.requestDomain, tt.policyDomain)
			if err != nil {
				t.Errorf("domainMatch() error = %v", err)
				return
			}
			if got != tt.want {
				// Debug: check roles
				roles := e.GetRolesForUserInDomain(tt.sub, tt.requestDomain)
				t.Logf("domainMatch(%q, %q, %q, %q) = %v, want %v",
					tt.sub, tt.role, tt.requestDomain, tt.policyDomain, got, tt.want)
				t.Logf("  roles in request domain: %v", roles)
				// Check parent domains
				for d := tt.requestDomain; d != ""; d = parentDomain(d) {
					matched, _ := util.GlobMatch(d, tt.policyDomain)
					roles := e.GetRolesForUserInDomain(tt.sub, d)
					t.Logf("  domain %q: globMatch=%v, roles=%v", d, matched, roles)
				}
			}
		})
	}
}

func splitCSV(s string) []string {
	// Simple CSV split for test data
	result := []string{}
	current := ""
	inQuote := false
	for _, r := range s {
		switch r {
		case '"':
			inQuote = !inQuote
		case ',':
			if !inQuote {
				result = append(result, current)
				current = ""
				continue
			}
			fallthrough
		default:
			current += string(r)
		}
	}
	result = append(result, current)
	return result
}
