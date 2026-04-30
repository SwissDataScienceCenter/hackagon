package testutils

import (
	"context"
	"fmt"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	"github.com/golang-jwt/jwt/v5"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entHackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/service"
)

const (
	// testBufBufferSize is 1 MB buffer for bufconn.
	testBufBufferSize = 1024 * 1024

	// testAdminKeycloakID is the Keycloak ID for the admin user used in tests.
	testAdminKeycloakID = "1183370a-46a2-4dad-b8fd-dd927d083e14"
)

// SetupFreshTestDB creates a fresh in-memory SQLite database for each test.
// The database is created with auto-migrate schema enabled.
func SetupFreshTestDB() *ent.Client {
	// Open SQLite in-memory database (non-shared for test isolation)
	dbClient, err := ent.Open("sqlite3", "file::memory:?cache=private&_fk=true")
	if err != nil {
		panic(fmt.Sprintf("failed to open in-memory SQLite: %v", err))
	}

	// Auto-migrate schema
	ctx := context.Background()
	if err := dbClient.Schema.Create(ctx); err != nil {
		panic(fmt.Sprintf("failed to create schema: %v", err))
	}

	return dbClient
}

// setupTestServerWithCustomDialer creates a bufconn listener, mock keyfunc,
// and returns the gRPC server, cleanup function, and client connection.
func setupTestServerWithCustomDialer(
	t *testing.T,
	cfg *config.Config,
	dbClient *ent.Client,
) (*grpc.Server, func(), *grpc.ClientConn) {
	t.Helper()

	// Seed admin user (required for admin-level RBAC access)
	ctx := context.Background()
	exists, err := dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(testAdminKeycloakID)).
		Exist(ctx)
	if err != nil {
		t.Fatalf("failed to check admin user existence: %v", err)
	}
	if !exists {
		_, err := dbClient.User.Create().
			SetKeycloakID(testAdminKeycloakID).
			SetUsername("hackagon-admin").
			SetDisplayName("Hackagon Admin").
			SetEmail("admin@hackagon.dev").
			Save(ctx)
		if err != nil {
			t.Fatalf("failed to seed admin user: %v", err)
		}
	}

	// Create mock keyfunc for testing
	mockKeyfunc := func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return testRSAKeyPairPublic, nil
	}

	keyfunc := jwt.Keyfunc(mockKeyfunc)
	server, cleanup, err := service.NewServer(dbClient, cfg, &keyfunc)
	if err != nil {
		t.Fatalf("couldn't create gRPC server: %v", err)
	}

	lis := bufconn.Listen(testBufBufferSize)

	go func() {
		if err := server.Serve(lis); err != nil {
			t.Logf("server error: %v", err)
		}
	}()

	conn, err := grpc.NewClient(
		"passthrough:///bufconn",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx) // Returns client end of in-memory pipe
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("failed to connect to bufconn: %v", err)
	}

	// Cleanup: close connection when test ends
	t.Cleanup(func() { _ = conn.Close() })

	return server, cleanup, conn
}

// CreateTestServerForTest creates a complete test environment with fresh DB and server.
// Returns the DB client and gRPC client connection.
// Pattern: Tests call this once at the start, then use the returned components.
func CreateTestServerForTest(t *testing.T) (*ent.Client, *grpc.ClientConn) {
	t.Helper()

	// Create fresh database
	dbClient := SetupFreshTestDB()
	t.Cleanup(func() { _ = dbClient.Close() })

	cfg := NewTestConfig(testAdminKeycloakID)

	enf, err := middleware.NewRBACEnforcer(cfg)
	if err != nil {
		t.Fatalf("failed to create enforcer: %v", err)
	}

	// Ensure admin policy is present (sometimes SQLite in-memory doesn't persist)
	_, err = enf.AddGlobalRole(testAdminKeycloakID, "admin")
	if err != nil {
		t.Fatalf("failed to add admin global role: %v", err)
	}

	// Create client connection with bufconn
	_, _, conn := setupTestServerWithCustomDialer(t, cfg, dbClient)

	return dbClient, conn
}

// NewTestHackathon creates a test hackathon with minimal required fields.
// Returns the hackathon entity and ID.
func NewTestHackathon(t *testing.T, db *ent.Client) (*ent.Hackathon, string) {
	t.Helper()

	h, err := CreateTestHackathon(db, "Test Hackathon", entHackathon.VisibilityPublic)
	if err != nil {
		t.Fatalf("failed to create test hackathon: %v", err)
	}

	return h, h.ID.String()
}

// NewTestUser creates a test user with minimal required fields.
// Returns the user entity.
func NewTestUser(db *ent.Client, keycloakID, username string) (*ent.User, error) {
	return db.User.Create().
		SetKeycloakID(keycloakID).
		SetUsername(username).
		SetDisplayName(username).
		SetEmail(username + "@test.local").
		Save(context.Background())
}

// RequirePermissionCheck verifies that a permission check works as expected.
// This is a helper for testing the RequirePermission middleware.
func RequirePermissionCheck(t *testing.T, enf *middleware.Enforcer, ctx context.Context, hackathonID string, object middleware.ObjectType, perm middleware.Permission) {
	t.Helper()

	err := enf.RequirePermission(ctx, hackathonID, object, perm)
	if err != nil {
		t.Logf("permission check failed: %v", err)
	}
}

// GetStatusError extracts the gRPC status code from an error.
func GetStatusError(err error) codes.Code {
	if err == nil {
		return codes.OK
	}
	s, ok := status.FromError(err)
	if !ok {
		return codes.Unknown
	}
	return s.Code()
}

// CreateTestJWTToken creates a JWT token for testing with the given subject.
func CreateTestJWTToken(subject string) string {
	return GenerateTestToken(subject, 24*time.Hour)
}
