package main

import (
	"fmt"
	"log"
	"net"
	"os"

	grpc_middleware "github.com/grpc-ecosystem/go-grpc-middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/service"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	// Load configuration
	fmt.Println("starting backend service")
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	// Create health service
	healthService := service.NewHealthService()

	// Create gRPC server
	auth_middleware := mw.AuthUnaryServerInterceptor(mw.NewJWTValidator(*cfg))
	server := grpc.NewServer(grpc.UnaryInterceptor(grpc_middleware.ChainUnaryServer(auth_middleware)))

	// Register health service
	proto.RegisterHealthServer(server, healthService)

	reflection.Register(server)

	// Listen
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.Server.Port))
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	fmt.Printf("Starting gRPC server on port %s...\n", cfg.Server.Port)
	fmt.Printf("Health check endpoint: grpc://localhost:%s\n", cfg.Server.Port)

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
