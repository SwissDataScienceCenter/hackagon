# Backend Service

A gRPC-based microservice for Hackagon.

## Features

- **Health Check Endpoint**: `Check` RPC method to verify service health
- **Simple and lightweight**: Built with Go and gRPC

## Usage

```bash
# Start the server
PORT=3000 go run ./cmd/service/

# Test health check (with grpcurl)
grpcurl -plaintext localhost:3000 list
grpcurl -plaintext localhost:3000 health.Health/Check 
```

## Development

### Prerequisites

- Go 1.25+
- protoc (protocol buffers compiler)

### Building

```bash
go build -o backend ./cmd/service/
```

### Running Tests

```bash
go test ./...
```
