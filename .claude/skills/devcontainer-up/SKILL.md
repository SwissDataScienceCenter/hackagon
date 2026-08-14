---
name: devcontainer-up
description: Spin up the Hackagon devcontainer (docker compose) and get it fully ready — Nix installed, toolchain warmed, post-create bootstrap done — then run commands, the e2e test suites, or the mutation manifest inside it. Use when asked to start/stop the devcontainer or dev environment, run something inside the container, or run the hackathon e2e tests (which run in this container by default).
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
bash .claude/skills/devcontainer-up/scripts/start.sh --replay          # …with session replay, proved
bash .claude/skills/devcontainer-up/scripts/up.sh      # start + make ready (idempotent)
bash .claude/skills/devcontainer-up/scripts/e2e.sh smoke     # hackathon-e2e inside the container
bash .claude/skills/devcontainer-up/scripts/e2e.sh journey   # full lifecycle recipe
bash .claude/skills/devcontainer-up/scripts/mutate.sh run    # mutation manifest, fast tier
bash .claude/skills/devcontainer-up/scripts/mutate.sh check  # anchors still match source
bash .claude/skills/devcontainer-up/scripts/exec.sh just start   # any repo command inside
bash .claude/skills/devcontainer-up/scripts/exec.sh              # interactive shell inside
bash .claude/skills/devcontainer-up/scripts/down.sh              # stop (volumes kept)
bash .claude/skills/devcontainer-up/scripts/down.sh --volumes    # full cold reset
```

`start.sh` is **the one-command path**: container → stack → optionally the seed
fixture → optionally session replay → optionally a Cloudflare tunnel with OIDC
wired. It exists because the chain has four steps across three skills and
the one people forget is the last — a tunnel that serves pages but was never
auth-wired looks completely fine until somebody tries to sign in. It finishes by
driving a real login round-trip, because serving HTML proves nothing about OIDC.

The tunnel step is `cloudflare-tunnel/scripts/up.sh --with-auth`, which picks
**named** mode (a persistent hostname on a zone you own) when
`.claude/skills/cloudflare-tunnel/.env` supplies credentials, and a quick
`*.trycloudflare.com` tunnel otherwise. Quick tunnels stay the zero-setup
default; with a named hostname the issuer wiring survives restarts, so the
re-wire-after-every-suite-run dance disappears. `start.sh`'s own step banner
still says "quick tunnel" — the mode `up.sh` prints is the one that is true.

`mutate.sh` forwards to `hackathon-e2e/scripts/mutate.sh` inside the container.
Its fast tier (`go` + `vitest`) drives the compilers straight from source and
needs **no running stack**, only the container — so it works while the stack is
down, being rebuilt, or in use by somebody else.

**`--replay`** is the same idea for session replay: bring up the OpenReplay rig
(`openreplay-stack/scripts/up.sh`, which creates or reuses its admin account
from the gitignored `.secrets.env`), point the app at it
(`wire-frontend.sh` — project key read from OpenReplay's own API, written into
the gitignored `config.local.yaml`), and then **prove a session records** by
running the consent spec's first test: it clicks the real "Allow recording"
banner and counts the bytes the tracker posts to `/ingest`. Opt-in, always: the
rig is 23 more containers and wants 8 GB on top of the dev stack.

Three things that check are built to catch, none of which a `docker ps` would:

- a **stale `ingestPoint`** — every quick tunnel restart mints a new hostname,
  and the tracker fails silently against the old one (a named
  `OPENREPLAY_HOSTNAME` removes this failure, because the hostname stops
  changing);
- a **skip reported as a pass** — every spec under `tests/openreplay`
  self-skips when it cannot see `replay.enabled`, and a skipped Playwright run
  exits 0, so `start.sh` fails on the word `skipped` as well as on a failure;
- a **zero-byte capture** — the spec writes what it captured, and `start.sh`
  reads the file size back rather than trusting the exit code.

`--replay` runs BEFORE the tunnel step deliberately: the proof drives Playwright
over `localhost:8081` and its `setup` dependency logs every persona in, and a
wired tunnel repoints both OIDC issuers at the public hostname, so localhost
logins fail while it is up. Both end up wired — they own different keys in the
same `config.local.yaml` and neither can remove the other's.

There is a third rig with the same shape, not driven by `start.sh`:
`plausible-stack` (audience measurement, its own Postgres and ClickHouse, its
own tunnel, its own `.secrets.env`, and `plausible` as its key in the same
overlay). It costs ~750 MB idle where OpenReplay wants 8 GB of its own, and the
two coexist. Bring it up with `plausible-stack/scripts/up.sh` +
`wire-frontend.sh`, or get it alongside the public URL with
`cloudflare-tunnel/scripts/serve-public.sh --with-plausible`. **Unwire it before
a suite run** — a dashboard full of Playwright traffic is worse than an empty
one.

## What `up.sh` does

1. **Start the compose stack.** If the `devcontainer` CLI is installed it is
   preferred (`devcontainer up`) — it applies the Nix *feature* and runs
   post-create exactly like VS Code would. Otherwise it falls back to plain
   `docker compose up -d dev` and self-bootstraps: single-user Nix install
   (the feature is only applied by devcontainer tooling), flakes enabled,
   then the repo's own idempotent `.devcontainer/post-create.sh` (just/direnv
   bootstrap, dev secrets, codegen). Either path also starts `rustfs`
   explicitly — naming a service makes compose start only what is named, and
   `up -d dev` silently left the object store down.
2. **Prepare the object store** (`.devcontainer/rustfs-init.sh`, idempotent):
   bucket, public-read policy, seeded event covers. Nothing in the app's build
   path knows the store exists, so without this it is up and empty — broken
   `<img>` frames and 404s under `/objects`.
3. **Warm the dev shell** (`just develop true`): the first run downloads the
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
  they would collide). The OpenReplay and Plausible rigs are *not* in this
  compose file: each owns its own compose project, its own tunnel and its own
  gitignored `.secrets.env`, so bringing one up cannot recreate `dev`.
- **Editing `.devcontainer/docker-compose.yml` recreates the `dev` container
  on the next `compose up`**, which kills process-compose inside it *and*
  discards anything apt-installed at runtime. Restart the stack afterwards,
  and expect a cold first request. This is why Firefox's system libraries are
  baked into the Dockerfile rather than left to `--with-deps` — a rule that has
  had to be applied twice: an `apt-mark showmanual` diff before the 2026-08-13
  recreate found **21 more Playwright packages** (xvfb, libavcodec60, six font
  packages, the X/cairo/pango set) living only in the writable layer. They are
  in the image now, and the Dockerfile records how to re-derive the list after a
  Playwright bump. That comment is the recovery procedure after any recreate;
  read it before reaching for `--with-deps` again.
- **`git-lfs` is in the image** (2026-08-13). Three files in this repo are LFS
  pointers in HEAD and hold their real bytes in the worktree, smudged by the
  Windows host; without the filters installed, git inside the container compared
  pointer against content and reported all three modified forever. `git status`
  inside `dev` is a usable signal again, which the mutation runner's
  cleanliness check depends on. It did **not** buy back a performance floor —
  see the README's note on what entering the Nix shell actually costs.
- Postgres data lives in the `devenv-state` volume, the Nix store in
  `nix-store`; `down.sh` keeps both. `down.sh --volumes` deletes them —
  next start re-downloads the toolchain (minutes).
- **`node_modules`, `.svelte-kit` and `.pnpm-store` are named volumes**, not
  bind-mounted: small-file IO across the host mount is ~100× slower and caused
  a total outage (see the container traps in `.claude/CLAUDE.md`). They start
  empty on a fresh volume — `post-create.sh` chowns the root-owned mountpoints
  and `bootstrap.sh` repopulates them. Consequence: `node_modules` is not
  visible from Windows, so run editors/tooling inside the container.
- Playwright's Firefox **binary** is downloaded by the e2e suite itself
  (`run.sh` tries `playwright install --with-deps firefox` and falls back to a
  plain `playwright install firefox`); its **system libraries** come from the
  image, per the bullet above. `--with-deps` works because `vscode` has
  passwordless sudo, but nothing should depend on it succeeding.
- **Never run a bare `pnpm build` in `components/frontend`.** Two callers build
  *and serve* that one `build/service` tree — `hackathon-e2e/prod-frontend.sh`
  on :8081 and `cloudflare-tunnel/prod-serve.sh` on :8082 — so both go through
  `.claude/skills/lib/frontend-build.sh` (`build` | `if-stale` | `stale`): an
  exclusive `flock` so two builds cannot interleave, and a build into a temp dir
  swapped in atomically so `build/service` never contains a half-written tree.
  Note the 9p quirk it works around: a directory rename on the bind mount
  intermittently answers `EPERM`, so the swap retries and rolls the old tree
  back rather than leaving nothing in place.
- **`process list` saying `Running Ready` does not mean the service you think is
  running.** The frontend's readiness probe is a plain GET of :8081, which the
  harness's own adapter-node server answers just as happily as vite — a probe on
  a PORT cannot say which PROCESS holds it. That hid a vite crash loop (54
  restarts in 50 minutes, `Port 8081 is already in use`) whose only visible
  symptom was every other service starting slowly. Both stack processes are
  capped at `max_restarts = 3` in `tools/nix/hackagon/lib/toolchain.nix` now, and
  `hackathon-e2e/scripts/wait-ready.sh` reads the `RESTARTS` column back and
  warns at ≥3. **Read that column** — the number was always there.
- Config knobs (ports, base image, project name) come from
  `.devcontainer/.env` — see `.devcontainer/.env.example`. Cloudflare
  credentials for named tunnels are separate and live in
  `.claude/skills/cloudflare-tunnel/.env` (gitignored; `.env.example` beside it).
