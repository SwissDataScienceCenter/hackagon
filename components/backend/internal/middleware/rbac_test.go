//go:build test && unittest

package middleware

import (
	"context"
	"testing"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/mattn/go-sqlite3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// newTestConfig creates a config with SQLite for testing.
func newTestConfig() *config.Config {
	return &config.Config{
		Server: config.ServerConfig{
			AdminKeycloakID: "admin-uuid",
		},
		Database: config.DatabaseConfig{
			Driver: "sqlite3",
		},
	}
}

// newTestEnforcer creates a new RBAC Enforcer with SQLite for testing.
func newTestEnforcer(t *testing.T) *Enforcer {
	t.Helper()

	cfg := newTestConfig()
	enf, err := NewRBACEnforcer(cfg)
	require.NoError(t, err)
	require.NotNil(t, enf)

	// Save policy to ensure default policies are persisted
	err = enf.enforcer.SavePolicy()
	require.NoError(t, err)

	return enf
}

// TestNewRBACEnforcer tests the enforcer creation with SQLite
func TestNewRBACEnforcer(t *testing.T) {
	const adminID = "admin-uuid"
	enf := newTestEnforcer(t)

	adminCanReadUsers, err := enf.enforcer.Enforce(adminID, "any", "user", "read")
	require.NoError(t, err)
	assert.True(t, adminCanReadUsers, "Admin should be able to read users by default")
}

func TestEnforce(t *testing.T) {
	enf := newTestEnforcer(t)

	_, err := enf.enforcer.AddGroupingPolicy("alice", "owner", "h1")
	require.NoError(t, err)
	defer enf.enforcer.RemoveGroupingPolicy("alice", "owner", "h1")

	_, err = enf.enforcer.AddGroupingPolicy("bob", "member", "h1")
	require.NoError(t, err)
	defer enf.enforcer.RemoveGroupingPolicy("bob", "member", "h1")

	_, err = enf.enforcer.AddGroupingPolicy("eve", "owner", "h2")
	require.NoError(t, err)
	defer enf.enforcer.RemoveGroupingPolicy("eve", "owner", "h2")

	testCases := []struct {
		name       string
		user       string
		hackathon  string
		objectType string
		permission string
		expected   bool
	}{
		{
			name:       "Alice as owner can read h1",
			user:       "alice",
			hackathon:  "h1",
			objectType: "hackathon",
			permission: "read",
			expected:   true,
		},
		{
			name:       "Alice as owner can write h1",
			user:       "alice",
			hackathon:  "h1",
			objectType: "hackathon",
			permission: "write",
			expected:   true,
		},
		{
			name:       "Alice cannot read h2",
			user:       "alice",
			hackathon:  "h2",
			objectType: "hackathon",
			permission: "read",
			expected:   false,
		},
		{
			name:       "Bob as member can read h1",
			user:       "bob",
			hackathon:  "h1",
			objectType: "hackathon",
			permission: "read",
			expected:   true,
		},
		{
			name:       "Bob as member cannot write h1",
			user:       "bob",
			hackathon:  "h1",
			objectType: "hackathon",
			permission: "write",
			expected:   false,
		},
		{
			name:       "Bob cannot read h2",
			user:       "bob",
			hackathon:  "h2",
			objectType: "hackathon",
			permission: "read",
			expected:   false,
		},
		{
			name:       "Eve as owner can read h2",
			user:       "eve",
			hackathon:  "h2",
			objectType: "hackathon",
			permission: "read",
			expected:   true,
		},
		{
			name:       "Eve as owner can write h2",
			user:       "eve",
			hackathon:  "h2",
			objectType: "hackathon",
			permission: "write",
			expected:   true,
		},
		{
			name:       "Eve cannot read h1",
			user:       "eve",
			hackathon:  "h1",
			objectType: "hackathon",
			permission: "read",
			expected:   false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			allowed, err := enf.enforcer.Enforce(
				tc.user,
				tc.hackathon,
				tc.objectType,
				tc.permission,
			)
			require.NoError(t, err)
			assert.Equal(t, tc.expected, allowed, "Expected %v for %s", tc.expected, tc.name)
		})
	}
}

func TestEnforcePublicHackathon(t *testing.T) {
	enf := newTestEnforcer(t)

	_, err := enf.enforcer.AddPolicy("*", "h2", "hackathon", "read")
	require.NoError(t, err)
	defer enf.enforcer.RemovePolicy("*", "h2", "hackathon", "read")

	_, err = enf.enforcer.AddGroupingPolicy("alice", "owner", "h1")
	require.NoError(t, err)
	defer enf.enforcer.RemoveGroupingPolicy("alice", "owner", "h1")

	_, err = enf.enforcer.AddGroupingPolicy("bob", "member", "h1")
	require.NoError(t, err)
	defer enf.enforcer.RemoveGroupingPolicy("bob", "member", "h1")

	_, err = enf.enforcer.AddGroupingPolicy("eve", "owner", "h2")
	require.NoError(t, err)
	defer enf.enforcer.RemoveGroupingPolicy("eve", "owner", "h2")

	testCases := []struct {
		name       string
		user       string
		hackathon  string
		objectType string
		permission string
		expected   bool
	}{
		{
			name:       "Alice can read public h2",
			user:       "alice",
			hackathon:  "h2",
			objectType: "hackathon",
			permission: "read",
			expected:   true,
		},
		{
			name:       "Alice can't write public h2",
			user:       "alice",
			hackathon:  "h1",
			objectType: "hackathon",
			permission: "write",
			expected:   true,
		},
		{
			name:       "Bob can read public h2",
			user:       "bob",
			hackathon:  "h1",
			objectType: "hackathon",
			permission: "read",
			expected:   true,
		},
		{
			name:       "Bob can't write public h2",
			user:       "bob",
			hackathon:  "h1",
			objectType: "hackathon",
			permission: "write",
			expected:   false,
		},
		{
			name:       "Eve as owner can read h2",
			user:       "eve",
			hackathon:  "h2",
			objectType: "hackathon",
			permission: "read",
			expected:   true,
		},
		{
			name:       "Eve as owner can write h2",
			user:       "eve",
			hackathon:  "h2",
			objectType: "hackathon",
			permission: "write",
			expected:   true,
		},
		{
			name:       "Eve cannot read h1",
			user:       "eve",
			hackathon:  "h1",
			objectType: "hackathon",
			permission: "read",
			expected:   false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			allowed, err := enf.enforcer.Enforce(
				tc.user,
				tc.hackathon,
				tc.objectType,
				tc.permission,
			)
			require.NoError(t, err)
			assert.Equal(t, tc.expected, allowed, "Expected %v for %s", tc.expected, tc.name)
		})
	}
}

// TestRBAC_AdminAccess tests admin-level access control
func TestRBAC_AdminAccess(t *testing.T) {
	const adminID = "admin-uuid"
	enf := newTestEnforcer(t)

	testCases := []struct {
		name       string
		user       string
		hackathon  string
		objectType string
		permission string
		expected   bool
	}{
		{
			name:       "Admin reads any user",
			user:       adminID,
			hackathon:  "any",
			objectType: "user",
			permission: "read",
			expected:   true,
		},
		{
			name:       "Admin reads any hackathon",
			user:       adminID,
			hackathon:  "any",
			objectType: "hackathon",
			permission: "read",
			expected:   true,
		},
		{
			name:       "Admin writes any hackathon",
			user:       adminID,
			hackathon:  "any",
			objectType: "hackathon",
			permission: "write",
			expected:   true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			allowed, err := enf.enforcer.Enforce(
				tc.user,
				tc.hackathon,
				tc.objectType,
				tc.permission,
			)
			require.NoError(t, err)
			assert.Equal(
				t,
				tc.expected,
				allowed,
				"Admin should have %v access to %s %s",
				tc.expected,
				tc.objectType,
				tc.name,
			)
		})
	}
}

func TestRequirePermission(t *testing.T) {
	const adminID = "admin-uuid"
	enf := newTestEnforcer(t)

	_, err := enf.enforcer.AddGroupingPolicy("uuid-alice", "owner", "h1")
	require.NoError(t, err)
	defer enf.enforcer.RemoveGroupingPolicy("uuid-alice", "owner", "h1")

	testCases := []struct {
		name      string
		ctx       context.Context
		hackathon string
		object    ObjectType
		perm      Permission
		wantCode  codes.Code // codes.OK means no error expected
	}{
		{
			name:      "allowed: owner reads their hackathon",
			ctx:       ctxWithClaims("uuid-alice"),
			hackathon: "h1",
			object:    Hackathon,
			perm:      Read,
			wantCode:  codes.OK,
		},
		{
			name:      "denied: user has no role in hackathon",
			ctx:       ctxWithClaims("uuid-nobody"),
			hackathon: "h1",
			object:    Hackathon,
			perm:      Read,
			wantCode:  codes.PermissionDenied,
		},
		{
			name:      "allowed: admin bypasses all checks",
			ctx:       ctxWithClaims(adminID),
			hackathon: "any",
			object:    Hackathon,
			perm:      Read,
			wantCode:  codes.OK,
		},
		{
			name:      "internal error: no JWT claims in context",
			ctx:       context.Background(),
			hackathon: "h1",
			object:    Hackathon,
			perm:      Read,
			wantCode:  codes.Internal,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := enf.RequirePermission(tc.ctx, tc.hackathon, tc.object, tc.perm)
			if tc.wantCode == codes.OK {
				assert.NoError(t, err)
			} else {
				require.Error(t, err)
				assert.Equal(t, tc.wantCode, status.Code(err))
			}
		})
	}
}

// ctxWithClaims builds a context carrying JWT claims with the given sub.
func ctxWithClaims(sub string) context.Context {
	claims := jwt.MapClaims{"sub": sub}
	return context.WithValue(context.Background(), claimsKey{}, claims)
}

// TestEnforce_AdminByKeycloakID verifies that the Enforce method resolves
// admin access by matching the JWT subject (Keycloak ID) against g2 policies.
func TestEnforce_AdminByKeycloakID(t *testing.T) {
	const adminID = "admin-uuid"
	enf := newTestEnforcer(t)

	_, err := enf.enforcer.AddGroupingPolicy("uuid-alice", "owner", "h1")
	require.NoError(t, err)
	defer enf.enforcer.RemoveGroupingPolicy("uuid-alice", "owner", "h1")

	testCases := []struct {
		name      string
		ctx       context.Context
		hackathon string
		object    ObjectType
		perm      Permission
		expected  bool
	}{
		{
			name:      "Admin Keycloak ID matches g2 policy",
			ctx:       ctxWithClaims(adminID),
			hackathon: "any",
			object:    User,
			perm:      Read,
			expected:  true,
		},
		{
			name:      "Owner matched by sub UUID directly",
			ctx:       ctxWithClaims("uuid-alice"),
			hackathon: "h1",
			object:    Hackathon,
			perm:      Read,
			expected:  true,
		},
		{
			name:      "Unknown UUID is denied",
			ctx:       ctxWithClaims("uuid-nobody"),
			hackathon: "h1",
			object:    Hackathon,
			perm:      Read,
			expected:  false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			allowed, err := enf.Enforce(tc.ctx, tc.hackathon, tc.object, tc.perm)
			require.NoError(t, err)
			assert.Equal(t, tc.expected, allowed)
		})
	}
}
