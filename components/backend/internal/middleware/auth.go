package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/MicahParks/keyfunc"
	"github.com/golang-jwt/jwt/v4"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

type JWTValidator struct {
	JwksUrl   string
	Algorithm jwt.SigningMethod
	CacheTTL  time.Duration
	Issuer    string
}

func NewJWTValidator(cfg config.Config) *JWTValidator {
	alg := jwt.GetSigningMethod(cfg.Oidc.Algorithm)
	return &JWTValidator{
		JwksUrl:   cfg.Oidc.JwksUrl,
		Algorithm: alg,
		CacheTTL:  cfg.Oidc.CacheTTL,
		Issuer:    cfg.Oidc.IssuerUrl,
	}
}

type AuthFunc func(ctx context.Context) (context.Context, error)

func (svc *JWTValidator) AuthFunc() AuthFunc {
	return func(ctx context.Context) (context.Context, error) {
		ctx, err := svc.validate(ctx)
		return ctx, handleError(err, true)
	}
}

const authHeader = "authorization"

func extractToken(ctx context.Context) (string, error) {
	var token string
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return token, ErrMissingKey
	}
	authMetaData := md.Get(authHeader)
	if len(authMetaData) == 0 {
		return "", ErrMissingKey
	} else {
		token = authMetaData[0]
	}
	if token == "" {
		return token, ErrMissingKey
	}
	return token, nil
}

func (svc *JWTValidator) parseToken(token string) (*jwt.Token, error) {

	jwks, err := keyfunc.Get(svc.JwksUrl, keyfunc.Options{RefreshInterval: time.Minute * 5})
	if err != nil {
		return nil, fmt.Errorf("%v: %w", err, ErrJwksLoadError)
	}
	return jwt.ParseWithClaims(
		token,
		jwt.MapClaims{"iss": svc.Issuer},
		jwks.Keyfunc,
		jwt.WithValidMethods([]string{svc.Algorithm.Alg()}),
	)
}

type claimsKey struct{}

func (svc *JWTValidator) validate(ctx context.Context) (context.Context, error) {
	// Get raw token from grpc metadata
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
	claims := token.Claims.(jwt.MapClaims)
	if svc.Issuer != "" {
		ok := claims.VerifyIssuer(svc.Issuer, true)
		if !ok {
			return nil, handleJwtError(ErrTokenInvalidIssuer)
		}
	}
	// Set claims in context
	ctx = context.WithValue(ctx, claimsKey{}, claims)
	return ctx, nil

}

func GetClaims(ctx context.Context) (jwt.MapClaims, bool) {
	val, ok := ctx.Value(claimsKey{}).(jwt.MapClaims)
	return val, ok
}

func AuthUnaryServerInterceptor(validator *JWTValidator) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		ctx, err := validator.AuthFunc()(ctx)
		if err != nil {
			return nil, err
		}
		return handler(ctx, req)
	}
}
