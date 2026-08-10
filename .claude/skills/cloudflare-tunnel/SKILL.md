---
name: cloudflare-tunnel
description: Create and pipe a Cloudflare quick tunnel — a free, ephemeral public *.trycloudflare.com URL for the locally running stack, no Cloudflare account needed. One hostname serves frontend AND Keycloak (caddy path-mux), so --with-auth gives fully working OIDC login/registration through the tunnel. Use when asked to expose the app (or any local port) publicly, share a demo link, get a public URL, or demo login from a phone. Wraps the devcontainer's caddy+tunnel services and a generic any-port mode.
---

# Cloudflare quick tunnel

A **quick tunnel** is `cloudflared tunnel --url <target>`: cloudflared opens
an outbound connection to Cloudflare and receives a random public
`https://<words>.trycloudflare.com` URL that pipes to the target. No account,
no DNS, no config — but **ephemeral** (new URL every start, gone when the
process stops) and **public** (anyone with the link can reach the service
while it runs).

## Commands

```bash
bash .claude/skills/cloudflare-tunnel/scripts/up.sh            # tunnel the hackagon stack (view-only)
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth  # …with working OIDC login
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth --prod  # …serving the production build
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --port 3000  # tunnel any local port (generic mode)
bash .claude/skills/cloudflare-tunnel/scripts/url.sh           # print the current public URL(s)
bash .claude/skills/cloudflare-tunnel/scripts/down.sh          # stop all tunnels (+ undo auth rewiring + prod mode)
```

Prod mode on its own (the stack and tunnel must already be up):

```bash
bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh start https://X.trycloudflare.com
bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh status   # both ports + what the tunnel serves
bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh stop     # tunnel falls back to vite
```

`up.sh` waits for the URL to appear in the tunnel logs and prints it — that
IS the piping: grep `https://[a-z0-9-]*\.trycloudflare\.com` from
`cloudflared`'s stderr. Everything runs in Docker; nothing is installed on
the host.

## How each mode pipes

- **Default (hackagon stack)**: starts the compose `caddy` + `tunnel`
  services (profile `tunnel` in `.devcontainer/docker-compose.yml`). The
  tunnel targets caddy, which path-splits the single public hostname:
  `/realms/*` + `/resources/*` go to Keycloak (`dev:8180`), everything else
  to the frontend — see `.devcontainer/Caddyfile.tunnel`. The frontend route
  has TWO upstreams tried in order: `dev:8082` (the production build, when
  `--prod` is running) then `dev:8081` (`vite dev`). Vite binds loopback
  inside the dev container, so `up.sh` first (re)runs
  `.devcontainer/host-bridge.sh` — the socat bridge that republishes the
  loopback ports on the container's network interface. Vite's
  `server.allowedHosts` already allowlists `.trycloudflare.com`.
- **`--with-auth`**: after the URL appears, `auth-wire.sh` runs inside the
  dev container and (1) verifies Keycloak reports the https tunnel issuer
  (needs `proxy-headers=xforwarded`, baked into toolchain.nix — one full
  stack restart after first pulling that change), (2) allowlists the tunnel
  origin on the `hackagon-frontend` realm client via the admin API (the
  committed realm file stays untouched), (3) writes frontend `oidc.issuer`
  and backend `oidc.issuerurl` into each component's **`config.local.yaml`**
  and restarts both processes. `down.sh` (or `auth-wire.sh --restore`)
  undoes all of it. While wired, log in **through the tunnel URL** —
  localhost logins carry the wrong issuer and fail backend validation.
- **Wiring never touches a tracked file.** `config.local.yaml` sits beside
  `config.yaml` in the same config dir, is gitignored, optional and partial;
  both loaders read it **after `config.yaml` and before the environment**
  (`components/backend/internal/config/config.go`,
  `components/frontend/src/lib/server/settings.ts`), merging key by key so an
  overlay naming only the issuer leaves `jwksurl`, `clientId` and `audience`
  alone. `--restore` removes the **`oidc` block**, and the file only when that
  was the last key in it — it used to be a plain `rm`, which was right while
  there was one writer and became a silent bug when session replay
  (`openreplay-stack/scripts/wire-frontend.sh`) started owning `replay` in the
  same overlay: `hackathon-e2e/scripts/run.sh` calls `--restore` on the way into
  EVERY suite run, so an `rm` there would delete the replay wiring and the
  openreplay suite would self-skip and report green having tested nothing.
  `.claude/skills/lib/config-overlay.sh` does the per-key surgery for both
  writers. This replaced a `sed` over the two
  tracked `config.yaml` files with `.pretunnel` backups: while wired, the
  working tree differed from HEAD, and a `git add -A` committed a hostname that
  dies with the tunnel — which happened, and a fresh clone then pointed at a
  tunnel that no longer existed. `config_test.go` in the backend's config
  package asserts both tracked configs still say `localhost`, so the old shape
  cannot come back quietly.
- **`--prod`**: runs the adapter-node **production build** on its OWN port,
  `:8082`, next to `vite dev` on `:8081`. The dev server ships unbundled
  modules — measured on the landing page: **150 requests / 7.7 MB** versus
  **54 requests / 2.9 MB** built (code alone: 136 requests / 5.1 MB → 42 /
  0.26 MB; the rest is unoptimised JPEGs, identical either way).
  `prod-serve.sh` builds and launches `build/service/index.js` detached (pid +
  log under `.output/run/`); it stops nothing. Runs LAST in `up.sh`, after
  `auth-wire.sh`: config is read once into a module singleton at boot, so the
  issuer must already be on disk. Undo with `prod-serve.sh stop` or `down.sh`
  — caddy then falls back to vite on its own.
- **Generic (`--port N`)**: runs a one-off
  `cloudflare/cloudflared` container named `cf-quicktunnel-<N>` targeting
  `http://host.docker.internal:<N>` — works for anything listening on the
  host, independent of the devcontainer.

## Caveats

- **Login needs `--with-auth`**: the plain mode leaves OIDC pointed at
  `localhost:8180`, so only anonymous/public surfaces work through the
  tunnel. `--with-auth` rewires the issuers for the tunnel's lifetime; the
  Keycloak admin console stays localhost-only either way (caddy does not
  route `/admin`).
- **Fresh hostnames lose the DNS race**: the first lookup often lands before
  Cloudflare's record propagates and resolvers negative-cache the NXDOMAIN.
  `auth-wire.sh` pins the hostname inside the dev container via DoH to
  1.1.1.1 (`/etc/hosts`, removed on restore); remote devices (a phone) may
  just need a minute before the URL resolves.
- **The stack must already be serving.** `up.sh` checks `:8081` inside the dev
  container and fails fast if not — caddy proxies to the app and cloudflared
  resolves its target once at startup, so a tunnel started against a dead
  stack silently points at nothing. This check lives here, not as a compose
  `depends_on: service_healthy` on `dev`: that container's health depends on
  `just up`, which compose does not manage, and the config change needed to
  add the healthcheck recreates `dev` — killing the very stack it waits for.
- **If the tunnel serves nothing but caddy and cloudflared look fine**,
  recreate the tunnel container: cloudflared resolved `caddy`'s address at
  startup and caches it, so a caddy recreated underneath it leaves the tunnel
  pointing at a stale IP.
- **A suite run un-wires auth — but no longer takes the link down.**
  `scripts/run.sh` restores the localhost issuers for the duration of a run and
  re-wires on exit. In `--prod` mode the public URL keeps SERVING throughout
  (the built server on `:8082` is outside process-compose and holds its config
  in memory, so rewriting the overlay does not reach it); only *new logins* through
  the tunnel fail until the run ends and the re-wire restarts it. That trade is
  deliberate — **pages must never 502**. Prod mode used to share `:8081` with
  vite, so `run.sh` had to hand the port back and forth around every run and
  the public link answered **502 Bad Gateway for ~40s per suite**. Without
  `--prod` the tunnel rides on vite, which the suite does restart, so expect
  gaps there.
- **Prod mode needs `ORIGIN` *and* `AUTH_URL` set to the public URL**, and
  `prod-serve.sh` sets both. `ORIGIN` alone gives a tunnel where login
  completes, tokens are issued — and the visitor lands back signed out.
  Auth.js decides its cookie NAMES (`__Secure-authjs.session-token` vs
  `authjs.session-token`) twice per request cycle and from different inputs:
  the `/auth/*` routes see `event.request`, built from `ORIGIN` (https), while
  `event.locals.auth()` — the session read behind every page and the route
  guard — asks `createActionURL()`, which trusts the `X-Forwarded-Proto`
  header that caddy deliberately does not set to https for the frontend. So
  the callback writes the `__Secure-` cookie and every later request looks for
  the plain one. `AUTH_URL` short-circuits the header sniffing. Without
  `ORIGIN`, separately, every form POST 403s as cross-site.
- **Prod mode is a snapshot.** Source edits do nothing until
  `prod-serve.sh start <url>` rebuilds — there is no hot reload. Config is a
  snapshot too: `config.yaml` and its overlay are read once at boot, which is
  why `auth-wire.sh` restarts the built server after writing the overlay (and
  why localhost keeps its hot
  reload on `:8081` regardless). `status` reports both ports and which one the
  tunnel is currently served from.
- The URL is public while up — don't leave tunnels running unattended, and
  never tunnel anything with real data.
- Quick tunnels are rate-limited, best-effort infrastructure for demos —
  named tunnels (with a Cloudflare account) are the production path.
