---
name: devcontainer-up
description: Spin up the Hackagon devcontainer (docker compose) and get it fully ready — Nix installed, toolchain warmed, post-create bootstrap done — then run commands or the e2e test suites inside it. Use when asked to start/stop the devcontainer or dev environment, run something inside the container, or run the hackathon e2e tests (which run in this container by default).
---

# Devcontainer up & ready

Wraps `.devcontainer/docker-compose.yml` (service `dev`, user `vscode`,
workspace `/workspaces/hackagon`) so one command produces a container where
`just` / Nix / the whole toolchain work — from any host shell, including
Git Bash on Windows (MSYS path mangling is handled).

## Commands

```bash
bash .claude/skills/devcontainer-up/scripts/start.sh   # nothing → running stack (see below)
bash .claude/skills/devcontainer-up/scripts/start.sh --tunnel --seed   # …public, with login, seeded
bash .claude/skills/devcontainer-up/scripts/up.sh      # start + make ready (idempotent)
bash .claude/skills/devcontainer-up/scripts/e2e.sh smoke     # hackathon-e2e inside the container
bash .claude/skills/devcontainer-up/scripts/e2e.sh journey   # full lifecycle recipe
bash .claude/skills/devcontainer-up/scripts/exec.sh just start   # any repo command inside
bash .claude/skills/devcontainer-up/scripts/exec.sh              # interactive shell inside
bash .claude/skills/devcontainer-up/scripts/down.sh              # stop (volumes kept)
bash .claude/skills/devcontainer-up/scripts/down.sh --volumes    # full cold reset
```

`start.sh` is **the one-command path**: container → stack → optionally a
Cloudflare quick tunnel with OIDC wired → optionally the seed fixture. It
exists because the chain has four steps across three skills and the one people
forget is the last — a tunnel that serves pages but was never auth-wired looks
completely fine until somebody tries to sign in. It finishes by driving a real
login round-trip, because serving HTML proves nothing about OIDC.

## What `up.sh` does

1. **Start the compose stack.** If the `devcontainer` CLI is installed it is
   preferred (`devcontainer up`) — it applies the Nix *feature* and runs
   post-create exactly like VS Code would. Otherwise it falls back to plain
   `docker compose up -d dev` and self-bootstraps: single-user Nix install
   (the feature is only applied by devcontainer tooling), flakes enabled,
   then the repo's own idempotent `.devcontainer/post-create.sh` (just/direnv
   bootstrap, dev secrets, codegen).
2. **Warm the dev shell** (`just develop true`): the first run downloads the
   toolchain into the `nix-store` volume (slow once, cached afterwards).

`e2e.sh` is the **default entry point for the e2e tests**: it ensures the
container is ready, then forwards to
`.claude/skills/hackathon-e2e/scripts/run.sh` inside it. Ports 3000/8081/8180/
5432 are published to the host, so you can also watch the frontend at
http://localhost:8081 while tests run.

## Notes

- Everything (Keycloak, Postgres, backend, frontend) runs *inside* the `dev`
  container via process-compose. `rustfs` — the S3-compatible object store the
  storage service presigns against — is a sibling container and always on.
  Optional sidecars: `caddy`+`tunnel` (profile `tunnel`, see the
  cloudflare-tunnel skill) and `postgres`+`keycloak` as real containers
  (profile `services`, opt-in — `just up` still starts devenv's own copies and
  they would collide).
- **Editing `.devcontainer/docker-compose.yml` recreates the `dev` container
  on the next `compose up`**, which kills process-compose inside it *and*
  discards anything apt-installed at runtime. Restart the stack afterwards,
  and expect a cold first request. This is why Firefox's system libraries are
  baked into the Dockerfile rather than left to `--with-deps`.
- Postgres data lives in the `devenv-state` volume, the Nix store in
  `nix-store`; `down.sh` keeps both. `down.sh --volumes` deletes them —
  next start re-downloads the toolchain (minutes).
- **`node_modules`, `.svelte-kit` and `.pnpm-store` are named volumes**, not
  bind-mounted: small-file IO across the host mount is ~100× slower and caused
  a total outage (see the container traps in `.claude/CLAUDE.md`). They start
  empty on a fresh volume — `post-create.sh` chowns the root-owned mountpoints
  and `bootstrap.sh` repopulates them. Consequence: `node_modules` is not
  visible from Windows, so run editors/tooling inside the container.
- Playwright's Firefox is installed by the e2e suite itself inside the
  container (Ubuntu 24.04 base; `--with-deps` works because `vscode` has
  passwordless sudo).
- Config knobs (ports, base image, project name) come from
  `.devcontainer/.env` — see `.devcontainer/.env.example`.
