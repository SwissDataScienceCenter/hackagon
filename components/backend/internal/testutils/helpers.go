//go:build test && unittest

package testutils

import (
	"crypto/rand"
	"crypto/rsa"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/onsi/ginkgo/v2"

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

// NewTestConfig creates a test configuration with SQLite.
func NewTestConfig(adminKeycloakID string) *config.Config {
	spec := ginkgo.CurrentSpecReport()
	dbName := fmt.Sprintf("test_db_%s", spec.FullText())
	dbName = strings.ReplaceAll(strings.ToLower(dbName), " ", "_")
	return &config.Config{
		Server: config.ServerConfig{
			AdminKeycloakID: adminKeycloakID,
		},
		Database: config.DatabaseConfig{
			Driver: "sqlite3",
			DbName: dbName,
		},
		Oidc: config.OidcConfig{
			JwksUrl:   "http://test-keycloak/realms/test/protocol/openid-connect/certs",
			IssuerUrl: "http://test-keycloak/realms/test",
			Algorithm: jwt.SigningMethodRS256.Name,
		},
		Logging: config.LoggingConfig{Level: "debug"},
	}
}

// CreateTestJWTToken creates a JWT token for testing with the given subject.
// The token is valid for 24 hours from now.
func CreateTestJWTToken(subject string) string {
	return GenerateTestToken(subject, 24*time.Hour) //nolint:mnd // 24 hours in test file is fine
}

// Helper functions for optional fields in tests
func StringPtr(s string) *string {
	return &s
}

func BoolPtr(b bool) *bool {
	return &b
}

func Int32Ptr(i int32) *int32 {
	return &i
}

func EnumPtr[T ~int | ~int32 | ~int64](e T) *T {
	return &e
}
