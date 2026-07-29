//go:build test && unittest

package testutils

import (
	"context"
	"fmt"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/mattn/go-sqlite3"
	. "github.com/onsi/ginkgo/v2" //nolint:staticcheck // dot import in test file is fine
	. "github.com/onsi/gomega"    //nolint:staticcheck // dot import in test file is fine
	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	config "github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"

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
func SetupFreshTestDB(cfg *config.Config) *ent.Client {
	// Open SQLite in-memory database (non-shared for test isolation)
	dbClient, err := ent.Open("sqlite3", cfg.ConnectionStr())
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
// Returns the DB client, gRPC client connection, and the enforcer.
// Automatically sets up DeferCleanup for database, server, and connection.
// Suitable for Ginkgo tests: db, conn, enf := CreateTestServer(); client = NewClient(conn)
// Ensures admin user is seeded and admin global role is added.
func CreateTestServer() (*ent.Client, *grpc.ClientConn, *middleware.Enforcer) {
	GinkgoHelper()

	cfg := NewTestConfig(TestAdminKeycloakID)

	// Create fresh database
	dbClient := SetupFreshTestDB(cfg)
	DeferCleanup(func() { _ = dbClient.Close() })

	// Create mock keyfunc
	mockKeyfunc := func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		return testRSAKeyPairPublic, nil
	}

	keyfunc := jwt.Keyfunc(mockKeyfunc)
	server, cleanupServer, enf, err := service.NewServer(dbClient, cfg, &keyfunc)
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

	// Create client connection with bufconn
	lis := bufconn.Listen(TestBufBufferSize)
	go func() {
		if err := server.Serve(lis); err != nil {
			_, _ = fmt.Fprintf(GinkgoWriter, "server error: %v\n", err)
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

	return dbClient, conn, enf
}

// NewMockEnforcer creates a mock RBAC enforcer for testing with admin role pre-seeded.
func NewMockEnforcer(adminKeycloakID string) *middleware.Enforcer {
	GinkgoHelper()
	cfg := NewTestConfig(adminKeycloakID)
	enf, err := middleware.NewRBACEnforcer(cfg)
	Expect(err).NotTo(HaveOccurred())
	Expect(enf).NotTo(BeNil())

	_, err = enf.AddGlobalRole(adminKeycloakID, middleware.Admin)
	Expect(err).NotTo(HaveOccurred())

	return enf
}
