package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"os"

	grpc_middleware "github.com/grpc-ecosystem/go-grpc-middleware"
	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/logx"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/health"
	userSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/service"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func seedAdminUser(ctx context.Context, dbClient *ent.Client, cfg *config.Config) error {
	exists, err := dbClient.User.Query().
		Where(user.KeycloakIDEQ(cfg.Server.AdminKeycloakID)).
		Exist(ctx)
	if err != nil {
		return fmt.Errorf("check admin user: %w", err)
	}
	if exists {
		return nil
	}
	_, err = dbClient.User.Create().
		SetKeycloakID(cfg.Server.AdminKeycloakID).
		SetUsername("hackagon-admin").
		SetDisplayName("Hackagon Admin").
		SetEmail(cfg.Server.AdminEmail).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("create admin user: %w", err)
	}
	slog.Info("seeded admin user", "keycloak_id", cfg.Server.AdminKeycloakID)
	return nil
}

func main() {
	logx.Setup("")

	configDirPtr := flag.String("config-dir", "./data/test/config/", "path to config")
	flag.Parse()
	cfg, err := config.Load(*configDirPtr)
	if err != nil {
		logx.Fatal("load config", "err", err)
	}
	logx.Setup(cfg.Logging.Level)

	slog.Info("starting backend service")
	// migrate database
	dbClient, err := ent.Open(
		"postgres",
		cfg.ConnectionStr(),
		ent.Log(func(a ...any) { slog.Debug("ent", "msg", fmt.Sprint(a...)) }),
	)
	if err != nil {
		logx.Fatal("open database", "err", err)
	}

	defer dbClient.Close()
	if err := dbClient.Schema.Create(context.Background()); err != nil {
		logx.Fatal("create schema", "err", err)
	}
	if err := seedAdminUser(context.Background(), dbClient, cfg); err != nil {
		logx.Fatal("seed admin user", "err", err)
	}
	enf, err := mw.NewRBACEnforcer(cfg)
	if err != nil {
		logx.Fatal("create RBAC enforcer", "err", err)
	}

	// Create services
	healthService := service.NewHealthService()
	userService := service.NewUserService(dbClient, enf)
	hackathonService := service.NewHackathonService(dbClient, enf)

	// Create gRPC server
	a, err := mw.NewJWTValidator(cfg)
	if err != nil {
		logx.Fatal("create JWT validator", "err", err)
	}
	auth_middleware := mw.AuthUnaryServerInterceptor(a)
	server := grpc.NewServer(
		grpc.UnaryInterceptor(grpc_middleware.ChainUnaryServer(auth_middleware)),
	)

	// Register health service
	health.RegisterHealthServiceServer(server, healthService)
	userSvc.RegisterUserServiceServer(server, userService)
	hackathonSvc.RegisterHackathonServiceServer(server, hackathonService)

	reflection.Register(server)

	// Listen
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.Server.Port))
	if err != nil {
		logx.Fatal("listen", "err", err)
	}

	slog.Info("grpc server listening", "port", cfg.Server.Port)

	// Serve
	if err := server.Serve(lis); err != nil {
		logx.Fatal("serve", "err", err)
	}

	// Graceful shutdown
	shutdown := make(chan os.Signal, 1)
	<-shutdown

	slog.Info("shutting down server")
	server.GracefulStop()
	slog.Info("server stopped")
}
