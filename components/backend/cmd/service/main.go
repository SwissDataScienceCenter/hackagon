package main

import (
	"fmt"
	"log"
	"net"
	"os"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/service"
	"github.com/swissdatasciencecenter/hackagon/components/backend/proto"
	"google.golang.org/grpc"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	// Create health service
	healthService := service.NewHealthService()

	// Create gRPC server
	server := grpc.NewServer()

	// Register health service
	proto.RegisterHealthServer(server, healthService)

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
