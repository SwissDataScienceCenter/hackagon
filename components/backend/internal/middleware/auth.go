package middleware

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const authHeader = "authorization"

type AuthFunc func(ctx context.Context) (context.Context, error)

type claimsKey struct{}

// AnonSubject is the JWT subject injected when no bearer token is present.
// Casbin treats it as an ordinary (unprivileged) subject, so it passes only
// wildcard rules — confirmed members always have a real Keycloak ID.
const AnonSubject = "anonymous"

type JWTValidator struct {
	JwksUrl   string
	Algorithm jwt.SigningMethod
	Issuer    string
	Keyfunc   jwt.Keyfunc
}

func NewJWTValidator(cfg *config.Config) (*JWTValidator, error) {
	alg := jwt.GetSigningMethod(cfg.Oidc.Algorithm)

	jwks, err := keyfunc.NewDefault([]string{cfg.Oidc.JwksUrl})
	if err != nil {
		return nil, fmt.Errorf("failed to create keyfunc: %w: %w", err, ErrJwksLoadError)
	}
	return &JWTValidator{
		JwksUrl:   cfg.Oidc.JwksUrl,
		Algorithm: alg,
		Issuer:    cfg.Oidc.IssuerUrl,
		Keyfunc:   jwks.Keyfunc,
	}, nil
}

// NewTestJWTValidator creates a JWT validator for testing that uses the provided keyfunc.
// This bypasses the remote JWKS loading which is not available in test environments.
func NewTestJWTValidator(cfg *config.Config, keyfunc jwt.Keyfunc) *JWTValidator {
	alg := jwt.GetSigningMethod(cfg.Oidc.Algorithm)
	return &JWTValidator{
		JwksUrl:   cfg.Oidc.JwksUrl,
		Algorithm: alg,
		Issuer:    cfg.Oidc.IssuerUrl,
		Keyfunc:   keyfunc,
	}
}

func (svc *JWTValidator) AuthFunc() AuthFunc {
	return func(ctx context.Context) (context.Context, error) {
		ctx, err := svc.validate(ctx)

		return ctx, handleError(err, true)
	}
}

func extractToken(ctx context.Context) (string, error) {
	var token string
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return "", ErrMissingKey
	}
	authMetaData := md.Get(authHeader)
	if len(authMetaData) == 0 {
		return "", ErrMissingKey
	} else {
		token = strings.TrimPrefix(authMetaData[0], "Bearer ")
	}
	if token == "" {
		return token, ErrMissingKey
	}

	return token, nil
}

func (svc *JWTValidator) parseToken(token string) (*jwt.Token, error) {
	return jwt.Parse(
		token,
		svc.Keyfunc,
		jwt.WithValidMethods([]string{svc.Algorithm.Alg()}),
		jwt.WithIssuer(svc.Issuer),
	)
}

func (svc *JWTValidator) validate(ctx context.Context) (context.Context, error) {
	tokenString, err := extractToken(ctx)
	if errors.Is(err, ErrMissingKey) {
		// No token — inject anonymous subject so casbin can evaluate access normally.
		ctx = context.WithValue(ctx, claimsKey{}, jwt.MapClaims{"sub": AnonSubject})
		return ctx, nil
	}

	token, err := svc.parseToken(tokenString)
	if err != nil {
		return nil, handleJwtError(err)
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return ctx, nil
	}
	ctx = context.WithValue(ctx, claimsKey{}, claims)
	return ctx, nil
}

func GetClaims(ctx context.Context) (jwt.MapClaims, bool) {
	val, ok := ctx.Value(claimsKey{}).(jwt.MapClaims)

	return val, ok
}

func GetSubject(ctx context.Context) (string, error) {
	claims, ok := GetClaims(ctx)
	if !ok {
		return "", errors.New("couldn't get claims from jwt")
	}
	sub, err := claims.GetSubject()
	if err != nil {
		return "", err
	}

	return sub, nil
}

func RequireSubject(ctx context.Context) (string, jwt.MapClaims, error) {
	claims, ok := GetClaims(ctx)
	if !ok {
		return "", nil, status.Error(codes.Unauthenticated, "no claims in context")
	}
	sub, err := claims.GetSubject()
	if err != nil || sub == "" {
		return "", nil, status.Error(codes.Unauthenticated, "missing subject claim")
	}
	return sub, claims, nil
}

func UsernameFromClaims(claims map[string]interface{}, fallback string) string {
	if v, ok := claims["preferred_username"].(string); ok && v != "" {
		return v
	}
	return fallback
}

func DisplayNameFromClaims(claims map[string]interface{}) string {
	if v, ok := claims["name"].(string); ok {
		return v
	}
	return ""
}

func EmailFromClaims(claims map[string]interface{}) string {
	if v, ok := claims["email"].(string); ok {
		return v
	}
	return ""
}

func AuthUnaryServerInterceptor(validator *JWTValidator) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		_ *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		ctx, err := validator.AuthFunc()(ctx)
		if err != nil {
			return nil, err
		}

		return handler(ctx, req)
	}
}
