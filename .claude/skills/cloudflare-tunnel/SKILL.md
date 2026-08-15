---
name: cloudflare-tunnel
description:
  Expose the locally running stack on a public URL through Cloudflare — either a
  NAMED tunnel on a hostname you own (persistent, survives restarts) or a free
  ephemeral *.trycloudflare.com quick tunnel needing no account at all. One
  hostname serves frontend AND Keycloak (caddy path-mux), so --with-auth gives
  fully working OIDC login/registration through the tunnel. Use when asked to
  expose the app (or any local port) publicly, share a demo link, get a public
  URL, set up a stable dev hostname, or demo login from a phone. Wraps the
  devcontainer's caddy+tunnel services, a named-tunnel mode driven by a
  gitignored Cloudflare API token, and a generic any-port mode.
---

# Cloudflare tunnel

Two modes, and `up.sh` picks between them.

A **quick tunnel** is `cloudflared tunnel --url <target>`: cloudflared opens an
outbound connection to Cloudflare and receives a random public
`https://<words>.trycloudflare.com` URL that pipes to the target. No account, no
DNS, no config — but **ephemeral** (new URL every start, gone when the process
stops) and **public** (anyone with the link can reach the service while it
runs).

A **named tunnel** is the same pipe with a hostname you own: a tunnel record in
a Cloudflare account, a proxied `CNAME` to `<tunnel-id>.cfargotunnel.com`, and a
credentials file cloudflared runs from. It needs an account, a zone and a
one-time API token — and in exchange the hostname is **the same tomorrow**.

**Named mode is chosen automatically when credentials are present** (`.env`
beside this file — see "Named tunnels" below); otherwise quick, which keeps this
the zero-setup path it has always been. `--named` / `--quick` force it, and
`up.sh` prints which mode it is in.

## Why a stable hostname is worth the setup

Most of the tunnel tooling's complexity exists to survive a hostname that
changes on every restart:

- `auth-wire.sh` re-points BOTH OIDC issuers at each new URL and restarts the
  frontend and the backend to load them (a cold backend restart is minutes).
- `hackathon-e2e/scripts/run.sh` unwires before every suite and re-wires on
  exit, because the personas log in over localhost.
- The adapter-node build reads its issuer and its `ORIGIN` once at boot, so a
  new hostname leaves it stale in two ways at once.
- A dead `*.trycloudflare.com` hostname once sat committed in HEAD for several
  commits, and a fresh clone pointed at a tunnel that no longer existed.

With a named hostname the second and every later `up.sh --with-auth` writes a
**byte-identical** overlay, so `config-overlay.sh` answers `unchanged` and
**nothing is rewritten and nothing is restarted** — `auth-wire.sh` confirms that
by minting a token from the wired issuer and asking the running backend whether
it accepts it, so the skip is granted by the far end rather than by the file.
The suite's unwire/re-wire is still there (localhost logins need the localhost
issuer), but it is now idempotent instead of a fresh hostname every time.

## Commands

```bash
bash .claude/skills/cloudflare-tunnel/scripts/up.sh            # tunnel the hackagon stack (view-only)
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth  # …with working OIDC login
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth --prod  # …serving the production build
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --named    # force a persistent hostname
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --quick    # force an ephemeral one
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --port 3000  # tunnel any local port (generic mode)
bash .claude/skills/cloudflare-tunnel/scripts/url.sh           # print the current public URL(s)
bash .claude/skills/cloudflare-tunnel/scripts/down.sh          # stop all tunnels (+ undo auth rewiring + prod mode)
```

Named-tunnel plumbing, shared by all three rigs:

```bash
bash .claude/skills/lib/cf-named-tunnel.sh check      # credentials + zone, nothing else
bash .claude/skills/lib/cf-named-tunnel.sh status     # which named tunnels are running
bash .claude/skills/lib/cf-named-tunnel.sh destroy hackagon <fqdn>   # give the hostname up
```

Prod mode on its own (the stack and tunnel must already be up):

```bash
bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh start https://X.trycloudflare.com
bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh status   # both ports + what the tunnel serves
bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh stop     # tunnel falls back to vite
```

`up.sh` waits for the URL to appear in the tunnel logs and prints it — that IS
the piping: grep `https://[a-z0-9-]*\.trycloudflare\.com` from `cloudflared`'s
stderr. Everything runs in Docker; nothing is installed on the host.

## Named tunnels

### What it builds

One tunnel **per rig**, not one tunnel with three ingress rules: the three rigs
live in three compose projects on three docker networks, so a single cloudflared
would have to be attached to all of them and restarted whenever any one came up
or down. Per-rig tunnels are independent, and a rig that is down simply has no
tunnel.

| rig        | hostname variable     | tunnel name           | origin                                                      |
| ---------- | --------------------- | --------------------- | ----------------------------------------------------------- |
| the app    | `HACKAGON_HOSTNAME`   | `hackagon`            | `http://caddy:80` (the same path-mux the quick tunnel uses) |
| Plausible  | `PLAUSIBLE_HOSTNAME`  | `hackagon-plausible`  | `http://plausible:8000`                                     |
| OpenReplay | `OPENREPLAY_HOSTNAME` | `hackagon-openreplay` | `http://caddy:80` (its own caddy)                           |

Nothing about caddy changes. `Caddyfile.tunnel` binds `:80` for **any** Host, so
the path mux, the `/objects` route and its `header_up Host {upstream_hostport}`
(without which every presigned upload 403s while reads keep working) apply
identically on a named hostname. `tests/tunnel/upload.spec.ts` proves that from
a browser on whichever hostname it is pointed at.

### The token

Cloudflare dashboard → **My Profile → API Tokens → Create Token → Create Custom
Token**:

1. **Permissions** — exactly two rows:
   - `Zone` · `DNS` · **Edit**
   - `Account` · `Cloudflare Tunnel` · **Edit**
2. **Zone Resources** — `Include` · `Specific zone` · _your zone_.
3. **Account Resources** — `Include` · _your account_.
4. Leave Client IP Address Filtering and TTL as you like; a TTL is a good idea
   for a setup credential.
5. Create, copy the token **once** (Cloudflare never shows it again), and paste
   it into `.claude/skills/cloudflare-tunnel/.env` (copy `.env.example`).

What each permission is for, and what it cannot do:

- **`Zone → DNS → Edit`** creates and updates the `CNAME` that makes the
  hostname resolve to the tunnel. It cannot read or change anything outside DNS
  — no zone settings, no WAF, no page rules, no cache purge.
- **`Account → Cloudflare Tunnel → Edit`** creates the tunnel record and reads
  back its run token. It is account-scoped because tunnels are account objects,
  not zone objects. It cannot touch DNS, and it cannot see any other kind of
  account resource.
- No account-read permission is needed: the account id is read out of the zone
  record the DNS permission already returns.

### ⚠ What "scoped" honestly means here

**A Cloudflare API token scopes to a ZONE, not to a hostname.** There is no
"only `hackagon.example.org`" grant, and no combination of settings produces
one. The narrowest possible token for this job can edit **any DNS record in that
entire zone** — the apex, mail records, a colleague's staging host. Do not
describe it, to yourself or anyone else, as restricted to the three subdomains:
it is not.

Two consequences worth acting on:

- **Use a zone you are willing to hand to a dev script.** A zone that also
  serves production mail or a live site is the wrong one.
- The tooling adds the guard Cloudflare cannot. `cf_dns_point` **refuses to
  replace a record it did not create** — anything that is not already a
  `*.cfargotunnel.com` CNAME is left alone and reported, and `CF_FORCE_DNS=1` is
  the deliberate override. That is what stands between a typo in `.env` and an
  unrelated hostname going down.

### The token is a SETUP credential — do not leave it on a runner

Once the tunnels exist, **nothing at run time needs the token**. `cfn_ensure`
writes a per-tunnel credentials file to
`.claude/skills/cloudflare-tunnel/.state/named/<name>/credentials.json`
(gitignored, `AccountTag` + `TunnelSecret` + `TunnelID`), and cloudflared runs
from that plus a local ingress file. That credential can do exactly one thing:
serve traffic for that one tunnel. **It cannot touch DNS, cannot enumerate the
zone, and cannot create anything.**

So split the two roles:

- The machine that **sets up** hostnames holds the `.env`.
- A machine that only **runs** a tunnel gets `.state/named/<name>/` copied to it
  and **no token at all**.

If a credentials file is ever lost, the tunnel is still recoverable without
deleting it and re-pointing DNS: the tunnel's run token is base64 of the same
three fields, and `cfn_ensure` rebuilds the file from it.

### Rotation, and what to do if it leaks

**Rotate the token now if it was ever transmitted in plain text** — pasted into
a chat, an issue, a terminal that is being recorded, or a shared clipboard. That
includes the initial hand-off: a secret that travelled in the clear should be
treated as spent the moment it has done its job.

- **Roll it**: dashboard → **My Profile → API Tokens** → the token's row → `…` →
  **Roll**. This issues a new value and **revokes the old one immediately** —
  there is no grace period, so anything still using the old value stops working
  at once. Paste the new value into `.env`; nothing else changes, because the
  tunnels and DNS records already exist and the run-time path does not use the
  token at all.
- **Delete it** instead if you no longer need setup access: same menu, `Delete`.
  Existing tunnels keep running — they authenticate with their own credentials
  files.
- **If it leaked**: roll or delete it FIRST, then look at the zone's DNS records
  (dashboard → the zone → DNS) for anything you did not create, and at **Zero
  Trust → Networks → Tunnels** for tunnels you did not create. A leaked token's
  blast radius is "any DNS record in that zone, plus any tunnel in that account"
  — plan the review around that, not around the three hostnames this tooling
  uses.
- The credentials files are secrets too, of a narrower kind. Revoke one by
  deleting its tunnel (`cf-named-tunnel.sh destroy <name> <fqdn>`), which also
  removes the DNS record.

### What is stored where

| path                                                                    | holds                                | protection                                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `.claude/skills/cloudflare-tunnel/.env`                                 | API token, zone, the three hostnames | gitignored by the repo-wide `.env` rule; every script `git check-ignore`s it before reading or writing and refuses otherwise |
| `.claude/skills/cloudflare-tunnel/.state/named/<name>/credentials.json` | per-tunnel run credential            | gitignored by `.claude/**/.state/`; written with `umask 077`; checked the same way                                           |
| `…/.state/named/<name>/config.yml`                                      | the ingress rules, generated         | gitignored; no secret in it                                                                                                  |
| `components/*/data/test/config.local.yaml`                              | the wired issuer                     | gitignored overlay, one key per writer (`config-overlay.sh`)                                                                 |

**Nothing tracked ever carries the hostname.** `internal/config/config_test.go`
asserts both tracked `config.yaml` files still say `localhost`, and that holds
for a named hostname exactly as it did for a quick one — a stable hostname is
still this machine's deployment choice, not the repo's.

### Known local-network trap: AAAA-only answers

On the machine this was built on, the LAN resolver returns Cloudflare's **IPv6**
edge for these names and no `A` record, on a network with no IPv6 route out.
Every lookup succeeds and every connection fails in milliseconds — so a check
that asks "does it resolve" says yes about a hostname nothing here can reach.

Both places that mattered ask the right question now: `auth-wire.sh` pins a
DoH-resolved **IPv4** edge into the dev container's `/etc/hosts` when the host
is _unreachable_ (it used to check only that it resolved), and the named-tunnel
readiness probe retries against a DoH-resolved address and, if that works, says
so — "the tunnel is fine, this machine's resolver is not". If a browser on your
laptop cannot reach a hostname that `--resolve` reaches, this is why.

## How each mode pipes

- **Named (hackagon stack)**: starts the compose `caddy` service only, then a
  `cf-named-hackagon` cloudflared container of its own on caddy's network, with
  a locally-managed ingress file. It does NOT go through the compose `tunnel`
  service — and it stops that service if it is running, because the OIDC issuer
  can only name ONE hostname and a second public URL would serve every page
  while silently failing every login. No file under `.devcontainer/` is edited:
  the container is a plain `docker run`, the same shape the generic `--port`
  mode uses, which also means it cannot trigger a recreate of `dev` (container
  trap 2).
- **Quick (hackagon stack)**: starts the compose `caddy` + `tunnel` services
  (profile `tunnel` in `.devcontainer/docker-compose.yml`). The tunnel targets
  caddy, which path-splits the single public hostname: `/realms/*` +
  `/resources/*` go to Keycloak (`dev:8180`), everything else to the frontend —
  see `.devcontainer/Caddyfile.tunnel`. The frontend route has TWO upstreams
  tried in order: `dev:8082` (the production build, when `--prod` is running)
  then `dev:8081` (`vite dev`). Vite binds loopback inside the dev container, so
  `up.sh` first (re)runs `.devcontainer/host-bridge.sh` — the socat bridge that
  republishes the loopback ports on the container's network interface. Vite's
  `server.allowedHosts` already allowlists `.trycloudflare.com`.
- **`--with-auth`**: after the URL appears, `auth-wire.sh` runs inside the dev
  container and (1) verifies Keycloak reports the https tunnel issuer (needs
  `proxy-headers=xforwarded`, baked into toolchain.nix — one full stack restart
  after first pulling that change), (2) allowlists the tunnel origin on the
  `hackagon-frontend` realm client via the admin API (the committed realm file
  stays untouched), (3) writes frontend `oidc.issuer` and backend
  `oidc.issuerurl` into each component's **`config.local.yaml`** and restarts
  both processes. `down.sh` (or `auth-wire.sh --restore`) undoes all of it.
  While wired, log in **through the tunnel URL** — localhost logins carry the
  wrong issuer and fail backend validation.
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
  writers. This replaced a `sed` over the two tracked `config.yaml` files with
  `.pretunnel` backups: while wired, the working tree differed from HEAD, and a
  `git add -A` committed a hostname that dies with the tunnel — which happened,
  and a fresh clone then pointed at a tunnel that no longer existed.
  `config_test.go` in the backend's config package asserts both tracked configs
  still say `localhost`, so the old shape cannot come back quietly.
- **`--prod`**: runs the adapter-node **production build** on its OWN port,
  `:8082`, next to `vite dev` on `:8081`. The dev server ships unbundled modules
  — measured on the landing page: **150 requests / 7.7 MB** versus **54 requests
  / 2.9 MB** built (code alone: 136 requests / 5.1 MB → 42 / 0.26 MB; the rest
  is unoptimised JPEGs, identical either way). `prod-serve.sh` builds and
  launches `build/service/index.js` detached (pid + log under `.output/run/`);
  it stops nothing. Runs LAST in `up.sh`, after `auth-wire.sh`: config is read
  once into a module singleton at boot, so the issuer must already be on disk.
  Undo with `prod-serve.sh stop` or `down.sh` — caddy then falls back to vite on
  its own.
- **Generic (`--port N`)**: runs a one-off `cloudflare/cloudflared` container
  named `cf-quicktunnel-<N>` targeting `http://host.docker.internal:<N>` — works
  for anything listening on the host, independent of the devcontainer.

## Caveats

- **Login needs `--with-auth`**: the plain mode leaves OIDC pointed at
  `localhost:8180`, so only anonymous/public surfaces work through the tunnel.
  `--with-auth` rewires the issuers for the tunnel's lifetime; the Keycloak
  admin console stays localhost-only either way (caddy does not route `/admin`).
- **Fresh hostnames lose the DNS race**: the first lookup often lands before
  Cloudflare's record propagates and resolvers negative-cache the NXDOMAIN.
  `auth-wire.sh` pins the hostname inside the dev container via DoH to 1.1.1.1
  (`/etc/hosts`, removed on restore); remote devices (a phone) may just need a
  minute before the URL resolves. This applies to a **newly created** named
  hostname too — once, rather than on every restart, which is the whole point.
- **A named hostname that resolves to nothing serving is a Cloudflare 1033 error
  page**, not a connection failure. `down.sh` stops the container and keeps the
  hostname, so that is what the link shows while the stack is down — which is
  more honest than a dead name, and is why `down.sh` does not delete the DNS
  record.
- **The stack must already be serving.** `up.sh` checks `:8081` inside the dev
  container and fails fast if not — caddy proxies to the app and cloudflared
  resolves its target once at startup, so a tunnel started against a dead stack
  silently points at nothing. This check lives here, not as a compose
  `depends_on: service_healthy` on `dev`: that container's health depends on
  `just up`, which compose does not manage, and the config change needed to add
  the healthcheck recreates `dev` — killing the very stack it waits for.
- **If the tunnel serves nothing but caddy and cloudflared look fine**, recreate
  the tunnel container: cloudflared resolved `caddy`'s address at startup and
  caches it, so a caddy recreated underneath it leaves the tunnel pointing at a
  stale IP.
- **A suite run un-wires auth — but no longer takes the link down.**
  `scripts/run.sh` restores the localhost issuers for the duration of a run and
  re-wires on exit. In `--prod` mode the public URL keeps SERVING throughout
  (the built server on `:8082` is outside process-compose and holds its config
  in memory, so rewriting the overlay does not reach it); only _new logins_
  through the tunnel fail until the run ends and the re-wire restarts it. That
  trade is deliberate — **pages must never 502**. Prod mode used to share
  `:8081` with vite, so `run.sh` had to hand the port back and forth around
  every run and the public link answered **502 Bad Gateway for ~40s per suite**.
  Without `--prod` the tunnel rides on vite, which the suite does restart, so
  expect gaps there.
- **Prod mode needs `ORIGIN` _and_ `AUTH_URL` set to the public URL**, and
  `prod-serve.sh` sets both. `ORIGIN` alone gives a tunnel where login
  completes, tokens are issued — and the visitor lands back signed out. Auth.js
  decides its cookie NAMES (`__Secure-authjs.session-token` vs
  `authjs.session-token`) twice per request cycle and from different inputs: the
  `/auth/*` routes see `event.request`, built from `ORIGIN` (https), while
  `event.locals.auth()` — the session read behind every page and the route guard
  — asks `createActionURL()`, which trusts the `X-Forwarded-Proto` header that
  caddy deliberately does not set to https for the frontend. So the callback
  writes the `__Secure-` cookie and every later request looks for the plain one.
  `AUTH_URL` short-circuits the header sniffing. Without `ORIGIN`, separately,
  every form POST 403s as cross-site.
- **Prod mode is a snapshot.** Source edits do nothing until
  `prod-serve.sh start <url>` rebuilds — there is no hot reload. Config is a
  snapshot too: `config.yaml` and its overlay are read once at boot, which is
  why `auth-wire.sh` restarts the built server after writing the overlay (and
  why localhost keeps its hot reload on `:8081` regardless). `status` reports
  both ports and which one the tunnel is currently served from.
- The URL is public while up — don't leave tunnels running unattended, and never
  tunnel anything with real data. **This is more true of a named hostname, not
  less**: it is guessable, it is in your zone's DNS, and it comes back at the
  same address every time. A quick tunnel's obscurity was never security, but a
  named one does not even have that.
- Quick tunnels are rate-limited, best-effort infrastructure for demos. Named
  tunnels are the same technology Cloudflare runs in production, but nothing
  here makes this stack production-ready — the dev passwords are still
  `aliceandbob`, Keycloak is still `admin`/`admin`, and the object store still
  ships committed credentials.
