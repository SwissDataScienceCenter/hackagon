package main

import (
	"fmt"
	"log"
	"net"
	"os"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/service"
	"github.com/swissdatasciencecenter/hackagon/components/backend/proto"
	"google.golang.org/grpc"
)

const (
	defaultPort = "8080"
)

func main() {
	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	// Create health service
	healthService := service.NewHealthService()

	// Create gRPC server
	server := grpc.NewServer()

	// Register health service
	proto.RegisterHealthServer(server, healthService)

	// Listen
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", port))
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	fmt.Printf("Starting gRPC server on port %s...\n", port)
	fmt.Printf("Health check endpoint: grpc://localhost:%s\n", port)

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
