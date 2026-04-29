package service

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/mattn/go-sqlite3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	// testBufBufferSize is 1 MB buffer for bufconn
	testBufBufferSize = 1024 * 1024
	// testAdminKeycloakID matches the admin user seeded in tests
	testAdminKeycloakID = "1183370a-46a2-4dad-b8fd-dd927d083e14"
)

// testRSAKeyPair is shared across all tests for JWT signing
var testRSAKeyPair *rsa.PrivateKey
var testRSAKeyPairPublic *rsa.PublicKey

func init() {
	var err error
	testRSAKeyPair, err = rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	testRSAKeyPairPublic = &testRSAKeyPair.PublicKey
}

func newTestSQLiteConfig(adminKeycloakID string) *config.Config {
	return &config.Config{
		Server: config.ServerConfig{
			AdminKeycloakID: adminKeycloakID,
		},
		Database: config.DatabaseConfig{
			Driver: "sqlite3",
		},
		Oidc: config.OidcConfig{
			JwksUrl:   "http://test-keycloak/realms/test/protocol/openid-connect/certs",
			IssuerUrl: "http://test-keycloak/realms/test",
			Algorithm: jwt.SigningMethodRS256.Name,
		},
	}
}

// generateTestToken creates a signed JWT for a given subject
func generateTestToken(t *testing.T, subject string, expiration time.Duration) string {
	claims := jwt.MapClaims{
		"sub": subject,
		"exp": time.Now().Add(expiration).Unix(),
		"iat": time.Now().Unix(),
		"iss": "http://test-keycloak/realms/test",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tokenString, err := token.SignedString(testRSAKeyPair)
	require.NoError(t, err, "should not fail to sign token")
	return tokenString
}

// setupFreshTestDB creates a fresh in-memory SQLite database for each test.
func setupFreshTestDB(t *testing.T) *ent.Client {
	t.Helper()

	// Open SQLite in-memory database (non-shared for test isolation)
	dbClient, err := ent.Open("sqlite3", "file::memory:?cache=private&_fk=true")
	require.NoError(t, err, "should open in-memory SQLite")
	require.NoError(t, err, "should open in-memory SQLite")

	// Auto-migrate schema
	ctx := context.Background()
	require.NoError(t, dbClient.Schema.Create(ctx), "should create schema")

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
	exists, err := dbClient.User.Query().Where(entuser.KeycloakIDEQ(testAdminKeycloakID)).Exist(ctx)
	if err != nil {
		t.Fatalf("check admin user existence: %v", err)
	}
	if !exists {
		_, err := dbClient.User.Create().
			SetKeycloakID(testAdminKeycloakID).
			SetUsername("hackagon-admin").
			SetDisplayName("Hackagon Admin").
			SetEmail("admin@hackagon.dev").
			Save(ctx)
		require.NoError(t, err, "should seed admin user")
	}

	// Create mock keyfunc for testing
	mockKeyfunc := func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return testRSAKeyPairPublic, nil
	}

	keyfunc := jwt.Keyfunc(mockKeyfunc)
	server, cleanup, err := NewServer(dbClient, cfg, &keyfunc)
	if err != nil {
		t.Fatalf("couldn't create grpc server: %v", err)
	}

	lis := bufconn.Listen(testBufBufferSize)

	go func() {
		if err := server.Serve(lis); err != nil {
			t.Logf("server error: %v", err)
		}
	}()
	t.Cleanup(cleanup)

	conn, err := grpc.NewClient(
		"passthrough:///bufconn",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx) // Returns client end of in-memory pipe
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err, "connecting to bufconn")

	// Cleanup: close connection when test ends
	t.Cleanup(func() { _ = conn.Close() })

	return server, nil, conn
}

// createTestServerForTest creates a complete test environment with fresh DB and server.
// Pattern: tests call this once at the start, then use the returned components.
func createTestServerForTest(t *testing.T) (*ent.Client, *grpc.ClientConn) {
	t.Helper()

	// Create fresh database
	dbClient := setupFreshTestDB(t)
	t.Cleanup(func() { _ = dbClient.Close() })

	cfg := newTestSQLiteConfig(testAdminKeycloakID)

	enf, err := middleware.NewRBACEnforcer(cfg)
	require.NoError(t, err, "should create enforcer")

	// Ensure admin policy is present (sometimes SQLite in-memory doesn't persist)
	_, err = enf.AddGlobalRole(testAdminKeycloakID, "admin")
	require.NoError(t, err, "should add admin global role")

	// Create client connection with bufconn
	_, _, conn := setupTestServerWithCustomDialer(t, cfg, dbClient)

	return dbClient, conn
}

// TestHackathonService_Create tests basic hackathon creation by admin user
func TestHackathonService_Create(t *testing.T) {
	dbClient, conn := createTestServerForTest(t)

	client := hackathonSvc.NewHackathonServiceClient(conn)

	token := generateTestToken(t, testAdminKeycloakID, 24*time.Hour)
	ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

	now := time.Now()
	desc := "A test hackathon description"
	req := &msgs.CreateRequest{
		Name:        "Test Hackathon",
		Description: &desc,
		Visibility:  entities.Visibility_VISIBILITY_PUBLIC,
		StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
		EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
	}

	resp, err := client.Create(ctx, req)
	require.NoError(t, err, "should create hackathon successfully")
	assert.NotEmpty(t, resp.HackathonId, "should return hackathon ID")

	// Verify in database
	h, err := dbClient.Hackathon.Query().
		Where(enthackathon.IDEQ(uuid.MustParse(resp.HackathonId))).
		WithCreator().
		Only(context.Background())
	require.NoError(t, err, "should find hackathon in DB")
	assert.Equal(t, "Test Hackathon", h.Name)
	assert.Equal(t, enthackathon.VisibilityPublic, h.Visibility)
	assert.NotNil(t, h.Edges.Creator, "should have creator")
	assert.Equal(t, testAdminKeycloakID, h.Edges.Creator.KeycloakID, "creator keycloak ID")
}

func TestHackathonService_List(t *testing.T) {
	_, conn := createTestServerForTest(t)

	client := hackathonSvc.NewHackathonServiceClient(conn)
	token := generateTestToken(t, testAdminKeycloakID, 24*time.Hour)
	ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

	// Create multiple hackathons
	hackathons := []struct {
		name       string
		visibility entities.Visibility
	}{{
		name:       "Public Hack 1",
		visibility: entities.Visibility_VISIBILITY_PUBLIC,
	}, {
		name:       "Public Hack 2",
		visibility: entities.Visibility_VISIBILITY_PUBLIC,
	}, {
		name:       "Private Hack",
		visibility: entities.Visibility_VISIBILITY_PRIVATE,
	}}

	for _, h := range hackathons {
		req := &msgs.CreateRequest{
			Name:       h.name,
			Visibility: h.visibility,
		}
		_, err := client.Create(ctx, req)
		require.NoError(t, err, "create %s should succeed", h.name)
	}

	// List and verify
	listResp, err := client.List(ctx, &msgs.ListRequest{})
	require.NoError(t, err, "list should succeed")
	assert.Len(t, listResp.Hackathons, len(hackathons), "should list all hackathons")

	for _, expected := range hackathons {
		found := false
		for _, actual := range listResp.Hackathons {
			if actual.Name == expected.name && actual.Visibility == expected.visibility {
				found = true
				break
			}
		}
		assert.True(t, found, "should find %s in list", expected.name)
	}
}

func TestHackathonService_Get(t *testing.T) {
	_, conn := createTestServerForTest(t)

	client := hackathonSvc.NewHackathonServiceClient(conn)
	token := generateTestToken(t, testAdminKeycloakID, 24*time.Hour)
	ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

	// Create hackathon
	now := time.Now()
	createReq := &msgs.CreateRequest{
		Name:       "Get Test Hackathon",
		Visibility: entities.Visibility_VISIBILITY_PUBLIC,
		StartsAt:   timestamppb.New(now.Add(24 * time.Hour)),
		EndsAt:     timestamppb.New(now.Add(48 * time.Hour)),
	}

	createResp, err := client.Create(ctx, createReq)
	require.NoError(t, err, "should create hackathon for Get test")
	assert.NotEmpty(t, createResp.HackathonId, "should return hackathon ID")

	// Get hackathon
	getReq := &msgs.GetRequest{HackathonId: createResp.HackathonId}
	getResp, err := client.Get(ctx, getReq)
	require.NoError(t, err, "should get hackathon successfully")

	// Validate response fields
	h := getResp.Hackathon
	assert.Equal(t, createResp.HackathonId, h.Id)
	assert.Equal(t, "Get Test Hackathon", h.Name)
	assert.Equal(t, entities.Visibility_VISIBILITY_PUBLIC, h.Visibility)

	assert.NotNil(t, h.Creator, "creator should be populated in Get response")
	assert.Equal(t, testAdminKeycloakID, h.Creator.KeycloakId)
	assert.Equal(t, "hackagon-admin", h.Creator.Username)

	assert.Equal(t, entities.HackathonStatus_HACKATHON_STATUS_PENDING, h.Status)
}

// TestHackathonService_Create_Auth tests RBAC for hackathon creation
func TestHackathonService_Create_Auth(t *testing.T) {
	_, conn := createTestServerForTest(t)

	client := hackathonSvc.NewHackathonServiceClient(conn)

	t.Run("admin can create", func(t *testing.T) {
		token := generateTestToken(t, testAdminKeycloakID, 24*time.Hour)
		ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

		req := &msgs.CreateRequest{
			Name:       "Auth Test Hackathon",
			Visibility: entities.Visibility_VISIBILITY_PUBLIC,
		}

		resp, err := client.Create(ctx, req)
		require.NoError(t, err, "admin should be able to create")
		assert.NotEmpty(t, resp.HackathonId)
	})

	t.Run("non-admin without role cannot create", func(t *testing.T) {
		token := generateTestToken(t, "non-admin-user", 24*time.Hour)
		ctx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

		req := &msgs.CreateRequest{
			Name:       "Unauthorized Create",
			Visibility: entities.Visibility_VISIBILITY_PUBLIC,
		}

		resp, err := client.Create(ctx, req)
		assert.Error(t, err, "non-admin should not be able to create")
		if err != nil {
			st := status.Convert(err)
			assert.Equal(t, codes.PermissionDenied, st.Code(), "should be PermissionDenied")
		}
		assert.Nil(t, resp)
	})
}
