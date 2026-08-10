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

We use [ent](https://entgo.io/) as an ORM. Use `just codegen::db-schema` to
generate the db schema files. An overview of the DB schema can be found in
[Schema.md](./Schema.md)

## Test Data

`just db::seed` populates the database with 3 hackathons
(upcoming/ongoing/past), a mix of tracks, projects, teams, and submissions, and
4 users (admin, alice, bob, charles). Seeding runs in a single transaction and
is idempotent — re-running is a no-op if the seed hackathon already exists. See
[cmd/seed/README.md](cmd/seed/README.md) for a full breakdown with timeline and
user-involvement diagrams.

`just db::summary` prints entity counts and per-hackathon/per-user detail. Use
it to sanity-check the DB after seeding or migrations.

`just clean::state` wipes Postgres + Keycloak state; restart with
`just deploy::up` and re-seed with `just db::seed` afterwards.

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
