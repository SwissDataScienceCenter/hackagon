//go:build test && unittest

package middleware_test

import (
	"context"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	. "github.com/onsi/ginkgo/v2"
	"github.com/onsi/gomega"
	"google.golang.org/grpc/metadata"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("Auth Middleware", func() {

	var (
		cfg     *config.Config
		keyfunc jwt.Keyfunc
	)

	BeforeEach(func() {
		cfg = testutils.NewTestConfig("admin-uuid")
		keyfunc = func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return testutils.GetTestRSAPublicKey(), nil
		}
	})

	Describe("Valid Token Processing", func() {
		It("processes valid token and injects claims", func() {
			tokenString := testutils.GenerateTestToken("test-user-123", 24*time.Hour)
			gomega.Expect(tokenString).NotTo(gomega.BeEmpty())

			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "Bearer "+tokenString,
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			newCtx, err := validator.AuthFunc()(ctx)
			gomega.Expect(err).NotTo(gomega.HaveOccurred())

			claims, ok := middleware.GetClaims(newCtx)
			gomega.Expect(ok).To(gomega.BeTrue())
			gomega.Expect(claims["sub"]).To(gomega.Equal("test-user-123"))
			gomega.Expect(claims["exp"]).NotTo(gomega.BeNil())
			gomega.Expect(claims["iat"]).NotTo(gomega.BeNil())
		})

		It("handles different user subjects correctly", func() {
			tokenString := testutils.GenerateTestToken("different-user-456", 24*time.Hour)
			gomega.Expect(tokenString).NotTo(gomega.BeEmpty())
			gomega.Expect(tokenString).To(gomega.ContainSubstring("."))

			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "Bearer "+tokenString,
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			newCtx, err := validator.AuthFunc()(ctx)
			gomega.Expect(err).NotTo(gomega.HaveOccurred())

			claims, ok := middleware.GetClaims(newCtx)
			gomega.Expect(ok).To(gomega.BeTrue())
			gomega.Expect(claims["sub"]).To(gomega.Equal("different-user-456"))
		})
	})

	Describe("Invalid Token Handling", func() {
		It("rejects malformed tokens", func() {
			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "Bearer not-a-valid-token",
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			_, err := validator.AuthFunc()(ctx)
			gomega.Expect(err).To(gomega.HaveOccurred())
			gomega.Expect(err.Error()).To(gomega.ContainSubstring("token is malformed"))
		})

		It("rejects expired tokens", func() {
			tokenString := testutils.GenerateTestToken("expired-user", -1*time.Hour)
			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "Bearer "+tokenString,
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			_, err := validator.AuthFunc()(ctx)
			gomega.Expect(err).To(gomega.HaveOccurred())
			gomega.Expect(err.Error()).To(gomega.ContainSubstring("token is expired"))
		})

		It("rejects tokens with future not-before", func() {
			// Create a token with nbf (not before) set to 1 hour in the future
			claims := jwt.MapClaims{
				"sub": "future-user",
				"exp": time.Now().Add(24 * time.Hour).Unix(),
				"iat": time.Now().Unix(),
				"nbf": time.Now().Add(1 * time.Hour).Unix(),
				"iss": cfg.Oidc.IssuerUrl,
			}
			token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
			tokenString, err := token.SignedString(testutils.GetTestRSAPrivateKey())
			gomega.Expect(err).NotTo(gomega.HaveOccurred())

			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "Bearer "+tokenString,
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			_, err = validator.AuthFunc()(ctx)
			gomega.Expect(err).To(gomega.HaveOccurred())
			gomega.Expect(err.Error()).To(gomega.ContainSubstring("token is not valid yet"))
		})
	})

	Describe("Missing Auth Header Handling", func() {
		It("injects anonymous claims when Authorization header is missing", func() {
			ctx := metadata.NewIncomingContext(context.Background(), nil)

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			newCtx, err := validator.AuthFunc()(ctx)
			gomega.Expect(err).NotTo(gomega.HaveOccurred())

			claims, ok := middleware.GetClaims(newCtx)
			gomega.Expect(ok).To(gomega.BeTrue())
			gomega.Expect(claims["sub"]).To(gomega.Equal(middleware.AnonSubject))
		})

		It("injects anonymous claims when Authorization header is empty", func() {
			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "",
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			newCtx, err := validator.AuthFunc()(ctx)
			gomega.Expect(err).NotTo(gomega.HaveOccurred())

			claims, ok := middleware.GetClaims(newCtx)
			gomega.Expect(ok).To(gomega.BeTrue())
			gomega.Expect(claims["sub"]).To(gomega.Equal(middleware.AnonSubject))
		})

		It("rejects invalid tokens without Bearer prefix", func() {
			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "not-a-valid-token-at-all",
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			_, err := validator.AuthFunc()(ctx)
			gomega.Expect(err).To(gomega.HaveOccurred())
			gomega.Expect(err.Error()).To(gomega.ContainSubstring("token is malformed"))
		})
	})

	Describe("GetClaims Function", func() {
		It("retrieves claims when available", func() {
			ctx := middleware.CtxWithClaims("test-user")

			retrievedClaims, ok := middleware.GetClaims(ctx)
			gomega.Expect(ok).To(gomega.BeTrue())
			gomega.Expect(retrievedClaims["sub"]).To(gomega.Equal("test-user"))
			gomega.Expect(retrievedClaims).NotTo(gomega.BeNil())
		})

		It("returns false and nil when no claims available", func() {
			ctx := context.Background()

			retrievedClaims, ok := middleware.GetClaims(ctx)
			gomega.Expect(ok).To(gomega.BeFalse())
			gomega.Expect(retrievedClaims).To(gomega.BeNil())
		})
	})

	Describe("GetSubject Function", func() {
		It("returns subject when available", func() {
			ctx := middleware.CtxWithClaims("test-user-subject")

			subject, err := middleware.GetSubject(ctx)
			gomega.Expect(err).NotTo(gomega.HaveOccurred())
			gomega.Expect(subject).To(gomega.Equal("test-user-subject"))
		})

		It("returns error when no claims available", func() {
			ctx := context.Background()

			subject, err := middleware.GetSubject(ctx)
			gomega.Expect(err).To(gomega.HaveOccurred())
			gomega.Expect(err.Error()).To(gomega.ContainSubstring("couldn't get claims from jwt"))
			gomega.Expect(subject).To(gomega.BeEmpty())
		})
	})

})
