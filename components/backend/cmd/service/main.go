package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"os"

	grpc_middleware "github.com/grpc-ecosystem/go-grpc-middleware"
	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/service"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func skipAuth(ctx context.Context, method string) bool {
	// Methods to skip auth for.
	fmt.Printf("%s", method)
	if method == "/health.Health/Check" {
		return true
	}

	return false
}

func main() {
	// Load configuration
	fmt.Println("starting backend service")
	configDirPtr := flag.String("config-dir", "./data/test/config/", "path to config")
	flag.Parse()
	cfg, err := config.Load(*configDirPtr)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}
	// migrate database
	dbClient, err := ent.Open(
		"postgres",
		cfg.ConnectionStr(),
	)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}

	defer dbClient.Close()
	if err := dbClient.Schema.Create(context.Background()); err != nil {
		log.Fatalf("failed creating schema resources: %v", err)
	}
	enf, err := mw.NewRBACEnforcer(cfg)
	if err != nil {
		log.Fatalf("failed to create RBAC enforcer: %v", err)
	}

	// Create services
	healthService := service.NewHealthService()
	userService := service.NewUserService(dbClient, enf)

	// Create gRPC server
	auth_middleware := mw.AuthUnaryServerInterceptor(mw.NewJWTValidator(cfg, skipAuth))
	server := grpc.NewServer(
		grpc.UnaryInterceptor(grpc_middleware.ChainUnaryServer(auth_middleware)),
	)

	// Register health service
	proto.RegisterHealthServer(server, healthService)
	proto.RegisterUserServer(server, userService)

	reflection.Register(server)

	// Listen
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.Server.Port))
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	fmt.Printf("Starting gRPC server on port %s...\n", cfg.Server.Port)
	fmt.Printf("Endpoint: grpc://localhost:%s\n", cfg.Server.Port)

	// Serve
	if err := server.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}

	// Graceful shutdown
	shutdown := make(chan os.Signal, 1)
	<-shutdown

	fmt.Println("\nShutting down server...")
	server.GracefulStop()
	log.Println("Server stopped")
}
