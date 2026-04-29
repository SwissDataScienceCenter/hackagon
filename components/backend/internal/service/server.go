package service

import (
	"fmt"

	"buf.build/go/protovalidate"
	grpc_middleware "github.com/grpc-ecosystem/go-grpc-middleware"
	protovalidate_middleware "github.com/grpc-ecosystem/go-grpc-middleware/v2/interceptors/protovalidate"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"github.com/golang-jwt/jwt/v5"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/logx"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/health"
	userSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user"
)

// NewServer creates a gRPC server with all middleware, services, and registration.
// Returns: server instance, cleanup function, error.
// The cleanup function should be called to gracefully stop the server.
func NewServer(
	dbClient *ent.Client,
	cfg *config.Config,
	keyfunc *jwt.Keyfunc,
) (*grpc.Server, func(), error) {
	// Create Casbin enforcer
	enf, err := mw.NewRBACEnforcer(cfg)
	if err != nil {
		logx.Fatal("create RBAC enforcer", "err", err)
	}

	// Create JWT validator
	var validator *mw.JWTValidator
	if keyfunc != nil {
		validator = middleware.NewTestJWTValidator(cfg, *keyfunc)
	} else {
		validator, err = middleware.NewJWTValidator(cfg)
		if err != nil {
			return nil, nil, fmt.Errorf("create jwt validator: %w", err)
		}
	}

	// Create protovalidate
	protoValidator, err := protovalidate.New()
	if err != nil {
		return nil, nil, fmt.Errorf("create protovalidate: %w", err)
	}
	validationInterceptor := protovalidate_middleware.UnaryServerInterceptor(protoValidator)

	// Create auth interceptor
	authInterceptor := middleware.AuthUnaryServerInterceptor(validator)

	// Create gRPC server with middleware chain (matching main.go exactly)
	server := grpc.NewServer(
		grpc.UnaryInterceptor(grpc_middleware.ChainUnaryServer(authInterceptor, validationInterceptor)),
	)

	// Create services
	healthService := NewHealthService()
	userService := NewUserService(dbClient, enf)
	hackathonService := NewHackathonService(dbClient, enf)

	// Register services
	health.RegisterHealthServiceServer(server, healthService)
	userSvc.RegisterUserServiceServer(server, userService)
	hackathonSvc.RegisterHackathonServiceServer(server, hackathonService)
	reflection.Register(server)

	// Cleanup: shutdown the gRPC server
	cleanup := func() {
		server.GracefulStop()
	}

	return server, cleanup, nil
}
