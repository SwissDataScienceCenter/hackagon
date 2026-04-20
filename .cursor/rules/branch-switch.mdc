---
description: Required steps after checking out a different branch or code version
alwaysApply: true
---

# After a Branch Switch

## Full workflow

After `git checkout`, `git switch`, or `git pull`:

1. **Check direnv** -- if it prints `.envrc changed`, run `direnv allow`. If the branch changed `tools/nix/flake.nix` or `tools/nix/flake.lock`, run `direnv reload` to pick up new tool versions. Otherwise skip this step.
2. **Run `just refresh`** -- regenerates all generated code and syncs dependencies.

```bash
just refresh
```

`just refresh` stops running services, wipes local Postgres and Keycloak state, regenerates Ent schema code, Go + TypeScript proto stubs, tidies Go modules, installs frontend deps, and recreates `go.work`. After it finishes, run `just up` to start fresh services (Keycloak re-imports the realm, backend auto-creates the DB schema via Ent).

## What is gitignored (must be regenerated)

- `components/backend/ent/*` (except `ent/schema/`) -- Ent ORM generated client
- `components/backend/internal/proto/` -- Go gRPC stubs
- `components/frontend/src/lib/server/grpc/generated/` -- TypeScript gRPC stubs
- `go.work` / `go.work.sum` -- Go workspace file

## When `just refresh` is sufficient

- Switched branches
- Pulled new commits that touched `api/proto/`, `ent/schema/`, `go.mod`, or `pnpm-lock.yaml`
- After a `just clean`

## When `direnv reload` is also needed

- The branch changed `tools/nix/flake.nix` or `tools/nix/flake.lock` (new Nix deps or tool versions)
- The branch changed `.envrc`
- A tool in `$PATH` behaves unexpectedly (stale binary from previous Nix shell)

## When `just clean-all` is needed

Almost never. Only use it when:

- `.devenv` or Go module cache is corrupted
- You need a guaranteed clean-clone state

`clean-all` runs `git clean -dfX` which **destroys everything gitignored** including `node_modules`, `.devenv`, and local secrets like `secrets.yaml`. Prefer `just refresh` in all normal cases.

## Never assume generated files exist

Before editing or referencing code in `components/backend/ent/` (non-schema), `components/backend/internal/proto/`, or `components/frontend/src/lib/server/grpc/generated/`, verify they exist or run `just refresh` first.
