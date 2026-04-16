# Backend Service

<!--toc:start-->

- [Backend Service](#backend-service)
  - [Features](#features)
  - [Usage](#usage)
  - [Database Schema](#database-schema)
  - [Development](#development) - [Prerequisites](#prerequisites) -
  [Building](#building) - [Running Tests](#running-tests)
  <!--toc:end-->

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

## Database Schema

We use [ent](https://entgo.io/) as an ORM. Use `just generate-db-schema` to
generate the db schema files. An overview of the DB schema can be found in
[Schema.md](./Schema.md)

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
