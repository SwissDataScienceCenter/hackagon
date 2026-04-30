package testutils

import (
	"context"
	"fmt"
	"net"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/mattn/go-sqlite3"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entHackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/service"
)

const (
	// TestBufBufferSize is 1 MB buffer for bufconn.
	TestBufBufferSize = 1024 * 1024

	// TestAdminKeycloakID is the Keycloak ID for the admin user used in tests.
	TestAdminKeycloakID = "1183370a-46a2-4dad-b8fd-dd927d083e14"
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

// CreateTestServer creates a complete test environment with fresh DB and server.
// Returns the DB client and gRPC client connection.
// Automatically sets up DeferCleanup for database, server, and connection.
// Suitable for Ginkgo tests: db, conn := CreateTestServer(); client = NewClient(conn)
// Ensures admin user is seeded and admin global role is added.
func CreateTestServer() (*ent.Client, *grpc.ClientConn) {
	GinkgoHelper()

	// Create fresh database
	dbClient := SetupFreshTestDB()
	DeferCleanup(func() { _ = dbClient.Close() })

	cfg := NewTestConfig(TestAdminKeycloakID)

	// Create mock keyfunc
	mockKeyfunc := func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return testRSAKeyPairPublic, nil
	}

	keyfunc := jwt.Keyfunc(mockKeyfunc)
	server, cleanupServer, err := service.NewServer(dbClient, cfg, &keyfunc)
	Expect(err).NotTo(HaveOccurred())
	DeferCleanup(cleanupServer)

	// Seed admin user (required for admin-level RBAC access)
	ctx := context.Background()
	exists, err := dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(TestAdminKeycloakID)).
		Exist(ctx)
	Expect(err).NotTo(HaveOccurred())
	if !exists {
		_, err := dbClient.User.Create().
			SetKeycloakID(TestAdminKeycloakID).
			SetUsername("hackagon-admin").
			SetDisplayName("Hackagon Admin").
			SetEmail("admin@hackagon.dev").
			Save(ctx)
		Expect(err).NotTo(HaveOccurred())
	}

	// Ensure admin policy is present
	enf, err := middleware.NewRBACEnforcer(cfg)
	Expect(err).NotTo(HaveOccurred())
	_, err = enf.AddGlobalRole(TestAdminKeycloakID, "admin")
	Expect(err).NotTo(HaveOccurred())

	// Create client connection with bufconn
	lis := bufconn.Listen(TestBufBufferSize)
	go func() {
		if err := server.Serve(lis); err != nil {
			fmt.Fprintf(GinkgoWriter, "server error: %v\n", err)
		}
	}()

	conn, err := grpc.NewClient(
		"passthrough:///bufconn",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	Expect(err).NotTo(HaveOccurred())
	DeferCleanup(func() { _ = conn.Close() })

	return dbClient, conn
}

// NewTestHackathon creates a test hackathon with minimal required fields.
// Returns the hackathon entity and ID.
func NewTestHackathon(db *ent.Client) (*ent.Hackathon, string) {
	GinkgoHelper()

	h, err := CreateTestHackathon(db, "Test Hackathon", entHackathon.VisibilityPublic)
	Expect(err).NotTo(HaveOccurred())

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
func RequirePermissionCheck(enf *middleware.Enforcer, ctx context.Context, hackathonID string, object middleware.ObjectType, perm middleware.Permission) {
	GinkgoHelper()

	err := enf.RequirePermission(ctx, hackathonID, object, perm)
	Expect(err).NotTo(HaveOccurred())
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

// NewMockEnforcer creates a mock RBAC enforcer for testing with admin role pre-seeded.
func NewMockEnforcer(adminKeycloakID string) *middleware.Enforcer {
	GinkgoHelper()
	cfg := NewTestConfig(adminKeycloakID)
	enf, err := middleware.NewRBACEnforcer(cfg)
	Expect(err).NotTo(HaveOccurred())
	Expect(enf).NotTo(BeNil())

	_, err = enf.AddGlobalRole(adminKeycloakID, "admin")
	Expect(err).NotTo(HaveOccurred())

	return enf
}
