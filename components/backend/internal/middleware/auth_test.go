//go:build test && unittest

package middleware_test

import (
	"context"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
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
			Expect(tokenString).NotTo(BeEmpty())

			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "Bearer "+tokenString,
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			newCtx, err := validator.AuthFunc()(ctx)
			Expect(err).NotTo(HaveOccurred())

			claims, ok := middleware.GetClaims(newCtx)
			Expect(ok).To(BeTrue())
			Expect(claims["sub"]).To(Equal("test-user-123"))
			Expect(claims["exp"]).NotTo(BeNil())
			Expect(claims["iat"]).NotTo(BeNil())
		})

		It("handles different user subjects correctly", func() {
			tokenString := testutils.GenerateTestToken("different-user-456", 24*time.Hour)
			Expect(tokenString).NotTo(BeEmpty())
			Expect(tokenString).To(ContainSubstring("."))

			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "Bearer "+tokenString,
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			newCtx, err := validator.AuthFunc()(ctx)
			Expect(err).NotTo(HaveOccurred())

			claims, ok := middleware.GetClaims(newCtx)
			Expect(ok).To(BeTrue())
			Expect(claims["sub"]).To(Equal("different-user-456"))
		})
	})

	Describe("Invalid Token Handling", func() {
		It("rejects malformed tokens", func() {
			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "Bearer not-a-valid-token",
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			_, err := validator.AuthFunc()(ctx)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("token is malformed"))
		})

		It("rejects expired tokens", func() {
			tokenString := testutils.GenerateTestToken("expired-user", -1*time.Hour)
			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "Bearer "+tokenString,
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			_, err := validator.AuthFunc()(ctx)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("token is expired"))
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
			Expect(err).NotTo(HaveOccurred())

			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "Bearer "+tokenString,
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			_, err = validator.AuthFunc()(ctx)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("token is not valid yet"))
		})
	})

	Describe("Missing Auth Header Handling", func() {
		It("injects anonymous claims when Authorization header is missing", func() {
			ctx := metadata.NewIncomingContext(context.Background(), nil)

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			newCtx, err := validator.AuthFunc()(ctx)
			Expect(err).NotTo(HaveOccurred())

			claims, ok := middleware.GetClaims(newCtx)
			Expect(ok).To(BeTrue())
			Expect(claims["sub"]).To(Equal(middleware.AnonSubject))
		})

		It("injects anonymous claims when Authorization header is empty", func() {
			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "",
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			newCtx, err := validator.AuthFunc()(ctx)
			Expect(err).NotTo(HaveOccurred())

			claims, ok := middleware.GetClaims(newCtx)
			Expect(ok).To(BeTrue())
			Expect(claims["sub"]).To(Equal(middleware.AnonSubject))
		})

		It("rejects invalid tokens without Bearer prefix", func() {
			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"authorization", "not-a-valid-token-at-all",
			))

			validator := middleware.NewTestJWTValidator(cfg, keyfunc)
			_, err := validator.AuthFunc()(ctx)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("token is malformed"))
		})
	})

	Describe("GetClaims Function", func() {
		It("retrieves claims when available", func() {
			ctx := middleware.CtxWithClaims("test-user")

			retrievedClaims, ok := middleware.GetClaims(ctx)
			Expect(ok).To(BeTrue())
			Expect(retrievedClaims["sub"]).To(Equal("test-user"))
			Expect(retrievedClaims).NotTo(BeNil())
		})

		It("returns false and nil when no claims available", func() {
			ctx := context.Background()

			retrievedClaims, ok := middleware.GetClaims(ctx)
			Expect(ok).To(BeFalse())
			Expect(retrievedClaims).To(BeNil())
		})
	})

	Describe("GetSubject Function", func() {
		It("returns subject when available", func() {
			ctx := middleware.CtxWithClaims("test-user-subject")

			subject, err := middleware.GetSubject(ctx)
			Expect(err).NotTo(HaveOccurred())
			Expect(subject).To(Equal("test-user-subject"))
		})

		It("returns error when no claims available", func() {
			ctx := context.Background()

			subject, err := middleware.GetSubject(ctx)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("couldn't get claims from jwt"))
			Expect(subject).To(BeEmpty())
		})
	})

})
