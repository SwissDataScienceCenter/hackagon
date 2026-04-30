package testutils

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"google.golang.org/grpc/metadata"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
)

var (
	// testRSAKeyPair is shared across all tests for JWT signing.
	// Generated once at package init for deterministic test behavior.
	testRSAKeyPair       *rsa.PrivateKey
	testRSAKeyPairPublic *rsa.PublicKey
)

// GetTestRSAPrivateKey returns the test RSA private key for custom JWT signing.
// Used when tests need to create tokens with specific claims.
func GetTestRSAPrivateKey() *rsa.PrivateKey {
	return testRSAKeyPair
}

// GetTestRSAPublicKey returns the test RSA public key for JWT verification.
// Used when tests need to create custom JWT validators.
func GetTestRSAPublicKey() *rsa.PublicKey {
	return testRSAKeyPairPublic
}

func init() {
	var err error
	testRSAKeyPair, err = rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(fmt.Sprintf("failed to generate test RSA key: %v", err))
	}
	testRSAKeyPairPublic = &testRSAKeyPair.PublicKey
}

// GenerateTestToken creates a signed JWT for a given subject (Keycloak ID).
// The token is valid for the specified duration from now.
// Uses a default issuer unless a custom one is provided.
func GenerateTestToken(subject string, expiration time.Duration, customIssuer ...string) string {
	issuer := "http://test-keycloak/realms/test"
	if len(customIssuer) > 0 {
		issuer = customIssuer[0]
	}

	claims := jwt.MapClaims{
		"sub": subject,
		"exp": time.Now().Add(expiration).Unix(),
		"iat": time.Now().Unix(),
		"iss": issuer,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tokenString, err := token.SignedString(testRSAKeyPair)
	if err != nil {
		panic(fmt.Sprintf("failed to sign test token: %v", err))
	}
	return tokenString
}

// CreateContextWithAuth creates a context with the authorization header set.
func CreateContextWithAuth(token string) context.Context {
	return metadata.NewIncomingContext(context.Background(), metadata.Pairs(
		"authorization", "Bearer "+token,
	))
}

// NewTestConfig creates a test configuration with SQLite.
func NewTestConfig(adminKeycloakID string) *config.Config {
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
