# Keycloak Configuration

Development Keycloak setup for the Hackagon platform.

## Overview

Keycloak runs as a local dev service managed by devenv/process-compose.

| Setting | Value |
|---------|-------|
| URL | http://localhost:8180 |
| Realm | hackagon |
| Admin user | admin |
| Admin password | admin |
| Database | dev-file (local H2, no external DB needed) |

## Quick Start
```bash
# From repo root
just up       # Start Keycloak (and other services)
just down     # Stop all services

# Verify Keycloak is running
curl http://localhost:8180/realms/hackagon/.well-known/openid-configuration
```

## Clients

| Client ID | Type | Used by |
|-----------|------|---------|
| `hackagon-frontend` | Public (no secret) | SvelteKit frontend |
| `hackagon-backend` | Confidential | Go gRPC backend |

## Test Users

| Username | Password | Role |
|----------|----------|------|
| alice | aliceandbob | participant |
| bob | aliceandbob | participant |
```bash
# Get an access token for testing
just get-access-token alice aliceandbob
```

## Saving Realm Changes

After making changes in the Keycloak admin UI:
```bash
cd tools/deploy/process-compose
just save-keycloak    # Exports realm to tools/configs/keycloak/realm-hackagon.json
git add tools/configs/keycloak/realm-hackagon.json
git commit -m "chore: update keycloak realm config"
```

## Realm File

`realm-hackagon.json` contains the full realm export including:
- Client definitions
- User accounts (with hashed passwords)
- Roles and scopes

The realm is automatically imported on Keycloak startup.
