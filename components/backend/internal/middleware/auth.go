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
	"google.golang.org/grpc/metadata"
)

const authHeader = "authorization"

type methodNameKey struct{}

type SkipFn func(ctx context.Context, method string) bool

type AuthFunc func(ctx context.Context) (context.Context, error)

type claimsKey struct{}

type JWTValidator struct {
	JwksUrl   string
	Algorithm jwt.SigningMethod
	Issuer    string
	Skip      SkipFn
	Keyfunc   jwt.Keyfunc
}

func NewJWTValidator(cfg *config.Config, skip SkipFn) (*JWTValidator, error) {
	alg := jwt.GetSigningMethod(cfg.Oidc.Algorithm)

	jwks, err := keyfunc.NewDefault([]string{cfg.Oidc.JwksUrl})
	if err != nil {
		return nil, fmt.Errorf("failed to create keyfunc: %w: %w", err, ErrJwksLoadError)
	}
	return &JWTValidator{
		JwksUrl:   cfg.Oidc.JwksUrl,
		Algorithm: alg,
		Issuer:    cfg.Oidc.IssuerUrl,
		Skip:      skip,
		Keyfunc:   jwks.Keyfunc,
	}, nil
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
	// Get raw token from grpc metadata
	method_name, ok := ctx.Value(methodNameKey{}).(string)
	if ok && svc.Skip != nil && svc.Skip(ctx, method_name) {
		return ctx, nil
	}
	tokenString, err := extractToken(ctx)
	if err != nil {
		return nil, handleJwtError(err)
	}
	// Parse token
	token, err := svc.parseToken(tokenString)
	if err != nil {
		return nil, handleJwtError(err)
	}
	// Verify standard claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return ctx, nil
	}
	// Set claims in context
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

func AuthUnaryServerInterceptor(validator *JWTValidator) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		ctx = context.WithValue(ctx, methodNameKey{}, info.FullMethod)
		ctx, err := validator.AuthFunc()(ctx)
		if err != nil {
			return nil, err
		}

		return handler(ctx, req)
	}
}
