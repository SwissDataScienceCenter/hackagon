# Hackagon

A hackathon platform. Monorepo: Go+gRPC backend, SvelteKit frontend, Keycloak for
auth, Postgres via ent ORM, casbin for per-hackathon RBAC. Built and run under a
Nix dev shell via `just` and `process-compose`.

## Working style

Before making changes:

1. Think and analyze first.
2. Explain the plan with alternatives where relevant.
3. Wait for confirmation before editing.
4. Make focused, single-purpose commits.
5. Show the diff + commit message, wait for approval before committing.

**Frontend exception:** for `components/frontend/` work, skip steps 3 and 5 — the
user drives in small, single-focused steps (one change described at a time),
implement just that change, then stop; don't batch multiple asks together or
proactively continue to the next logical step. The user writes and makes commits
themselves — don't draft or propose a commit message for frontend changes unless
asked.

## Deeper knowledge lives in skills

This file stays short because it loads on every turn. Load the skill that matches
what you're touching:

| Working on | Skill | Covers |
|---|---|---|
| `components/frontend/**` | **frontend-data-wiring** | gRPC client registration, `+page.server.ts` loading, error translation, data shaping, sidebar/nav entries, which pages are still mocked |
| `components/backend/internal/**` | **backend-services** | handler pattern, ent→proto mappers, casbin RBAC and role granting, service registration, verifying what's implemented |
| `api/proto/**` | **api-proto** | folder layout and `_svc`, read/write path contracts, buf validation, regenerating stubs |
| Running or debugging the stack | **dev-runtime** | `just` commands, seeding, psql, grpcurl, rebuilding the backend, dev users, reading backend crashes |

Most work here is frontend, and frontend work usually needs
**frontend-data-wiring** — it contains the API-wiring conventions.

## Repo layout

```
api/proto/<domain>/               # hackathon, user, health — see api-proto skill
components/backend/
├── cmd/service/main.go           # entry point
├── cmd/seed/main.go              # dev data (README inside)
├── db/schema/*.go                # DB schema — hand-written source of truth
├── ent/**                        # generated ORM (do not edit)
├── internal/service/*.go         # gRPC handlers, one file per service
├── internal/service/server.go    # where services are registered
├── internal/capability/          # what is open right now — pure, no ent/proto
├── internal/middleware/rbac.go   # casbin enforcer
└── Schema.md                     # generated DB reference
components/frontend/              # SvelteKit
├── src/lib/server/grpc/          # clients; generated/ is codegen (do not edit)
├── src/lib/navigation.ts         # every sidebar entry
├── src/lib/utils/capabilities.ts # what a member may do now; see the skill (§6b)
├── src/lib/components/           # layout/, hackathon/, forms/
└── src/routes/(marketing)|(app)  # (app) splits into (member)/(owner)/(admin)
tools/nix/                        # Nix flake + process-compose config
justfile                          # module-based; see dev-runtime skill
```

## Getting it running

```bash
just start        # the default — sync deps, start keycloak + postgres + backend
just down         # stop everything
just changes      # classify your diff and say which command to run
```

Dev users, password `aliceandbob` for all: `hackagon-admin` (global admin),
`alice` (organizer, owns a seeded hackathon), `bob`, `charles`. Backend serves
`localhost:3000`. Everything else — seeding, psql, grpcurl, module commands — is in
the **dev-runtime** skill.

## Don't

- Don't edit generated code: `components/backend/internal/proto/**`,
  `components/backend/ent/**`,
  `components/frontend/src/lib/server/grpc/generated/**`, `api/proto/API.md`.
  Regenerate with `just codegen::proto` / `just codegen::db-schema`.
- Don't run codegen outside the Nix shell — `buf` isn't on PATH. Use
  `just develop`, or stage the proto change and ask the user to regenerate.
- Don't skip the casbin check on a mutation handler, or the capability gate on one
  that has it. They answer different questions — "may they ever" vs "is it open
  now" — and passing one is not passing the other.
- Don't gate a capability on `state === "open"` / `== StateOpen`. A capability with
  no row resolves *ungoverned*, meaning "no opinion, behave as before"; comparing
  against open disables it on every hackathon that predates it.
- Don't assume a backend service is missing because a doc says so — these notes
  have been wrong in that direction repeatedly. Check `server.go` and the handler
  file first.
- Don't treat a frontend gate as a security boundary. Nothing filters
  `members[].user.email` by caller role, so any confirmed participant already
  receives every other member's email. Hiding a field client-side is UX, not
  enforcement.
- Don't expect `pnpm format` to touch `.svelte` files — `.prettierrc.yaml`
  registers no `prettier-plugin-svelte`, so Prettier errors with "No parser could
  be inferred" on every Svelte file. Svelte formatting is hand-maintained
  (4-space indent) until that's fixed.
