package middleware

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"fmt"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/metadata"
)

// TestKey is used for generating test tokens
var testPrivateKey *rsa.PrivateKey
var testPublicKey *rsa.PublicKey

func init() {
	var err error
	testPrivateKey, err = rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	testPublicKey = &testPrivateKey.PublicKey
}

// Helper function to create a test token
func createTestToken(t *testing.T, subject string, expiration time.Duration) string {
	return createTestTokenWithIssuer(t, subject, expiration, "http://test-issuer")
}

// Helper function to create a test token with a custom issuer
func createTestTokenWithIssuer(
	t *testing.T,
	subject string,
	expiration time.Duration,
	issuer string,
) string {
	claims := jwt.MapClaims{
		"sub": subject,
		"exp": time.Now().Add(expiration).Unix(),
		"iat": time.Now().Unix(),
		"iss": issuer,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tokenString, err := token.SignedString(testPrivateKey)
	require.NoError(t, err)
	return tokenString
}

// Helper function to create context with grpc metadata
func createContextWithAuth(token string) context.Context {
	return metadata.NewIncomingContext(context.Background(), metadata.Pairs(
		"authorization", "Bearer "+token,
	))
}

// Helper function to create context without auth header
func createContextWithoutAuth() context.Context {
	return context.Background()
}

// Helper function to create context with method name
func createContextWithMethod(method string) context.Context {
	ctx := createContextWithoutAuth()
	return context.WithValue(ctx, methodNameKey{}, method)
}

// TestAuthMiddleware_ValidToken tests that valid tokens are processed correctly
func TestAuthMiddleware_ValidToken(t *testing.T) {
	t.Run("ValidToken", func(t *testing.T) {
		tokenString := createTestToken(t, "test-user-123", 24*time.Hour)
		assert.NotEmpty(t, tokenString, "Token should be created")

		ctx := createContextWithAuth(tokenString)

		skipFn := func(ctx context.Context, method string) bool {
			return false
		}

		validator := newMockJWTValidator(t, skipFn)
		newCtx, err := validator.AuthFunc()(ctx)
		assert.NoError(t, err, "Valid token should not produce error")

		claims, ok := GetClaims(newCtx)
		assert.True(t, ok, "Claims should be available after valid token")
		assert.Equal(t, "test-user-123", claims["sub"], "Subject claim should match")
		assert.NotEmpty(t, claims["exp"], "Expiration claim should be set")
		assert.NotEmpty(t, claims["iat"], "Issued at claim should be set")
	})

	t.Run("ValidTokenWithDifferentUser", func(t *testing.T) {
		tokenString := createTestToken(t, "different-user-456", 24*time.Hour)
		assert.NotEmpty(t, tokenString, "Token should be created")
		assert.Contains(t, tokenString, ".", "Token should have multiple parts")

		ctx := createContextWithAuth(tokenString)

		skipFn := func(ctx context.Context, method string) bool {
			return false
		}

		validator := newMockJWTValidator(t, skipFn)
		newCtx, err := validator.AuthFunc()(ctx)
		assert.NoError(t, err, "Valid token should not produce error")

		claims, ok := GetClaims(newCtx)
		assert.True(t, ok, "Claims should be available after valid token")
		assert.Equal(t, "different-user-456", claims["sub"], "Subject claim should match")
	})
}

// TestAuthMiddleware_InvalidToken tests that invalid tokens are rejected
func TestAuthMiddleware_InvalidToken(t *testing.T) {
	t.Run("MalformedToken", func(t *testing.T) {
		ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
			"authorization", "Bearer not-a-valid-token",
		))

		skipFn := func(ctx context.Context, method string) bool {
			return false
		}

		validator := newMockJWTValidator(t, skipFn)
		_, err := validator.AuthFunc()(ctx)
		assert.Error(t, err, "Malformed token should produce error")
		assert.ErrorContains(t, err, "token is malformed", "Error should contain malformed message")
	})

	t.Run("ExpiredToken", func(t *testing.T) {
		tokenString := createTestToken(t, "expired-user", -1*time.Hour)

		ctx := createContextWithAuth(tokenString)

		skipFn := func(ctx context.Context, method string) bool {
			return false
		}

		validator := newMockJWTValidator(t, skipFn)
		_, err := validator.AuthFunc()(ctx)
		assert.Error(t, err, "Expired token should produce error")
		assert.ErrorContains(t, err, "token is expired", "Error should contain expired message")
	})

	t.Run("FutureNotBefore", func(t *testing.T) {
		claims := jwt.MapClaims{
			"sub": "future-user",
			"exp": time.Now().Add(24 * time.Hour).Unix(),
			"iat": time.Now().Unix(),
			"nbf": time.Now().Add(1 * time.Hour).Unix(),
			"iss": "http://test-issuer",
		}
		token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
		tokenString, err := token.SignedString(testPrivateKey)
		require.NoError(t, err)

		ctx := createContextWithAuth(tokenString)

		skipFn := func(ctx context.Context, method string) bool {
			return false
		}

		validator := newMockJWTValidator(t, skipFn)
		_, err = validator.AuthFunc()(ctx)
		assert.Error(t, err, "Future nbf token should produce error")
		assert.ErrorContains(
			t,
			err,
			"token is not valid yet",
			"Error should contain not valid yet message",
		)
	})
}

// TestAuthMiddleware_MissingAuth tests that missing auth header is rejected
func TestAuthMiddleware_MissingAuth(t *testing.T) {
	t.Run("MissingAuthorizationHeader", func(t *testing.T) {
		ctx := createContextWithoutAuth()

		skipFn := func(ctx context.Context, method string) bool {
			return false
		}

		validator := newMockJWTValidator(t, skipFn)
		_, err := validator.AuthFunc()(ctx)
		assert.Error(t, err, "Missing authorization header should produce error")
		assert.ErrorContains(
			t,
			err,
			"authorization header missing",
			"Error should be ErrMissingKey",
		)
	})

	t.Run("EmptyAuthorizationHeader", func(t *testing.T) {
		ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
			"authorization", "",
		))

		skipFn := func(ctx context.Context, method string) bool {
			return false
		}

		validator := newMockJWTValidator(t, skipFn)
		_, err := validator.AuthFunc()(ctx)
		assert.Error(t, err, "Empty authorization header should produce error")
		assert.ErrorContains(
			t,
			err,
			"authorization header missing",
			"Error should be ErrMissingKey",
		)
	})

	t.Run("MissingBearerPrefix", func(t *testing.T) {
		// Create a malformed token (invalid base64 encoding)
		ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
			"authorization", "not-a-valid-token-at-all",
		))

		skipFn := func(ctx context.Context, method string) bool {
			return false
		}

		validator := newMockJWTValidator(t, skipFn)
		_, err := validator.AuthFunc()(ctx)
		assert.Error(t, err, "Invalid token without Bearer prefix should produce error")
		assert.ErrorContains(t, err, "token is malformed", "Error should contain malformed message")
	})
}

// TestAuthMiddleware_SkipFunction tests that skip function works correctly
func TestAuthMiddleware_SkipFunction(t *testing.T) {
	t.Run("HealthCheckSkipped", func(t *testing.T) {
		skipFn := func(ctx context.Context, method string) bool {
			return method == "/health.Health/Check"
		}

		validator := newMockJWTValidator(t, skipFn)

		// Create context with health check method and no auth
		ctx := createContextWithMethod("/health.Health/Check")

		// Should not produce error even without valid token
		_, err := validator.AuthFunc()(ctx)
		assert.NoError(t, err, "Health check should be skipped")
	})

	t.Run("OtherMethodRequiresAuth", func(t *testing.T) {
		skipFn := func(ctx context.Context, method string) bool {
			return method == "/health.Health/Check"
		}

		validator := newMockJWTValidator(t, skipFn)

		// Create context with non-health method and no auth
		ctx := createContextWithMethod("/user.User/List")

		// Should produce error due to missing auth
		_, err := validator.AuthFunc()(ctx)
		assert.Error(t, err, "Non-health method should require auth")
		assert.ErrorContains(
			t,
			err,
			"authorization header missing",
			"Error should be ErrMissingKey",
		)
	})
}

// TestGetClaims tests the GetClaims function
func TestGetClaims(t *testing.T) {
	t.Run("ClaimsAvailable", func(t *testing.T) {
		claims := jwt.MapClaims{
			"sub":  "test-user",
			"role": "admin",
		}

		ctx := context.WithValue(context.Background(), claimsKey{}, claims)

		retrievedClaims, ok := GetClaims(ctx)
		assert.True(t, ok, "Claims should be available")
		assert.Equal(t, "test-user", retrievedClaims["sub"], "Subject should match")
		assert.Equal(t, "admin", retrievedClaims["role"], "Role should match")
	})

	t.Run("NoClaimsAvailable", func(t *testing.T) {
		ctx := context.Background()

		claims, ok := GetClaims(ctx)
		assert.False(t, ok, "Claims should not be available")
		assert.Nil(t, claims, "Claims should be nil")
	})
}

// TestGetSubject tests the GetSubject function
func TestGetSubject(t *testing.T) {
	t.Run("SubjectAvailable", func(t *testing.T) {
		claims := jwt.MapClaims{
			"sub": "test-user-subject",
		}

		ctx := context.WithValue(context.Background(), claimsKey{}, claims)

		subject, err := GetSubject(ctx)
		assert.NoError(t, err, "Should not produce error")
		assert.Equal(t, "test-user-subject", subject, "Subject should match")
	})

	t.Run("NoClaimsAvailable", func(t *testing.T) {
		ctx := context.Background()

		subject, err := GetSubject(ctx)
		assert.Error(t, err, "Should produce error when no claims")
		assert.Contains(
			t,
			err.Error(),
			"couldn't get claims from jwt",
			"Error should mention missing claims",
		)
		assert.Empty(t, subject, "Subject should be empty")
	})

	t.Run("MissingSubjectClaim", func(t *testing.T) {
		claims := jwt.MapClaims{
			"role": "admin",
		}

		ctx := context.WithValue(context.Background(), claimsKey{}, claims)

		subject, err := GetSubject(ctx)
		// GetSubject returns empty string when sub is missing, no error
		assert.NoError(t, err, "Should not error when subject missing")
		assert.Empty(t, subject, "Subject should be empty when sub claim is missing")
	})
}

// Helper function to create a mock JWTValidator for testing
func newMockJWTValidator(t *testing.T, skip SkipFn) *JWTValidator {
	// Create a keyfunc that uses our test key to verify tokens
	mockKeyfunc := func(token *jwt.Token) (interface{}, error) {
		// Verify the signing method is what we expect
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return testPublicKey, nil
	}

	return &JWTValidator{
		JwksUrl:   "http://mock-keycloak/realms/test/protocol/openid-connect/certs",
		Algorithm: jwt.SigningMethodRS256,
		Issuer:    "http://test-issuer",
		Skip:      skip,
		Keyfunc:   mockKeyfunc,
	}
}
