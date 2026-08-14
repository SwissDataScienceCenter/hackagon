# Hackagon documentation

Hackagon is a hackathon platform: a Go + gRPC backend, a SvelteKit frontend,
Keycloak for authentication, Postgres through the ent ORM, and casbin for
per-hackathon RBAC. The whole stack runs locally under a Nix dev shell driven by
`just` and process-compose.

## Guides

| Document                                                   | Answers                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)                         | How do the pieces fit together — repo layout, runtime topology, request flow, codegen?                                       |
| [getting-started.md](getting-started.md)                   | How do I get a working environment and run/seed/inspect the stack?                                                           |
| [architecture-model.md](architecture-model.md)             | The architecture as C4 (context / containers / components), channels, and the endpoint catalogue — generated from the model. |
| [backend/services.md](backend/services.md)                 | Which gRPC services and RPCs exist, and what does each handler do?                                                           |
| [backend/data-model.md](backend/data-model.md)             | What tables/entities exist and how do they relate?                                                                           |
| [backend/rbac.md](backend/rbac.md)                         | How are permissions modelled and enforced (casbin roles, domains, policy rows)?                                              |
| [backend/rpc-journal.md](backend/rpc-journal.md)           | The off-by-default RPC journal: what it records, what it never reads, and how it seeds recipe actions.                       |
| [frontend/routes-and-auth.md](frontend/routes-and-auth.md) | Which routes exist, which are public, and how does the session/auth guard work?                                              |
| [frontend/grpc-clients.md](frontend/grpc-clients.md)       | How does the SvelteKit server talk to the backend, and how are gRPC errors translated to HTTP?                               |
| [frontend/session-replay.md](frontend/session-replay.md)   | Session replay: what is recorded, when, on whose say-so, how consent is withdrawn, and how long recordings live.             |
| [user-flows.md](user-flows.md)                             | What does the platform look like to a visitor, participant, organizer and admin — screen by screen, desktop and phone?       |
| [lifecycle.md](lifecycle.md)                               | What is the end-to-end hackathon lifecycle, from publication through voting and prizes?                                      |
| [testing.md](testing.md)                                   | What test suites exist (Go, Vitest, Playwright e2e) and how do I run them?                                                   |
| [backend/schema.dbml](backend/schema.dbml)                 | The data model as DBML — paste into [dbdiagram.io](https://dbdiagram.io/d) for an interactive diagram.                       |
| [TODO.md](TODO.md)                                         | Known bugs, open decisions, and the cleanup checklist (from the 2026-08-04 code audit).                                      |
| [requirements.md](requirements.md)                         | Requirements summary (backend/frontend split, per-act themes) generated from the executable spec.                            |
| [roadmap.md](roadmap.md)                                   | What is MVP vs Core, the designed user flow scored step by step, and what is explicitly unscheduled.                         |
| [glossary.md](glossary.md)                                 | The domain vocabulary, code-grounded — including the collision-prone terms (capability, member, phase…).                     |
| [infrastructure.md](infrastructure.md)                     | What runs today vs what production needs; a paperdraw.dev build sheet with real load profiles.                               |
| [deployment.md](deployment.md)                             | The Helm chart: what an operator must supply, what will bite them, and the k3d rig that proved it (two modes, what each can prove). |

## Generated references

These two files are produced by codegen — do not edit them by hand.

| Reference                                                         | Contents                                                                        | Regenerate with           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------- |
| [`api/proto/API.md`](../api/proto/API.md)                         | Every proto message, enum, service and RPC (protoc-gen-doc output).             | `just codegen::proto`     |
| [`components/backend/Schema.md`](../components/backend/Schema.md) | Human-readable DB reference generated from `components/backend/db/schema/*.go`. | `just codegen::db-schema` |
