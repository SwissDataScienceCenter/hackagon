---
name: openreplay-stack
description: Spin up a self-hosted OpenReplay (session replay) instance with docker compose, behind a Cloudflare quick tunnel so the tracker can reach it from a browser. Vendors the upstream compose into the skill folder, prepares secrets non-interactively, and points the stack at the tunnel URL. Use when asked to run/try/evaluate OpenReplay, set up session replay, or get a public ingest endpoint for the tracker.
---

# OpenReplay behind a quick tunnel

A **debugging rig**, not a deployment. It brings up the full upstream stack
(24 services) with a `*.trycloudflare.com` URL in front, so you can wire the
SvelteKit tracker to a real ingest endpoint without owning a domain or a VM.

## Commands

```bash
bash .claude/skills/openreplay-stack/scripts/doctor.sh          # preflight — run this first
bash .claude/skills/openreplay-stack/scripts/up.sh              # fetch, prepare, tunnel, start
bash .claude/skills/openreplay-stack/scripts/up.sh --dry-run    # everything except `compose up`
bash .claude/skills/openreplay-stack/scripts/url.sh             # current public URL
bash .claude/skills/openreplay-stack/scripts/down.sh            # stop, keep recorded sessions
bash .claude/skills/openreplay-stack/scripts/down.sh --volumes  # stop and delete everything
```

First run pulls ~25 images and runs DB migrations — expect a long wait. Sign up
at `<url>/signup`; **the first account becomes the admin**.

## Layout

```
compose.tunnel.yaml    overlay: adds cloudflared, unpublishes caddy's host ports
scripts/               doctor · fetch-upstream · up · url · down
vendor/                upstream scripts/docker-compose/ (fetched, gitignored)
vendor/UPSTREAM.txt    repo, ref and exact commit — a fetch is reproducible
.state/                tunnel URL, "secrets prepared" marker (gitignored)
```

`vendor/` is fetched by sparse checkout at a pinned ref (`OPENREPLAY_REF`,
default `main`) rather than committed: it is upstream's code, it moves, and the
recorded commit makes any fetch repeatable. Upstream's `install.sh` is **not**
run — it prompts for a domain, wants sudo, and ends by starting everything;
`up.sh` does the same preparation non-interactively and keeps control.

## Why there is no second Caddy

**OpenReplay already ships Caddy as its ingress** (`{$CADDY_DOMAIN} {
reverse_proxy nginx-openreplay:80 }`), so putting another proxy in front would
be pure overhead. The overlay adds only `cloudflared` pointing at that Caddy,
and unpublishes its host ports — 80/443 are the likeliest to collide, and the
tunnel is the entrypoint anyway. Set `OPENREPLAY_PUBLISH_PORTS=1` if you want
them back.

Three settings make this work, and they are easy to get wrong:

| Setting | Value | Why |
| --- | --- | --- |
| `CADDY_DOMAIN` | `:80` | Caddy serves plain HTTP for any Host. Cloudflare terminates TLS at its edge, and ACME could never validate a `trycloudflare.com` hostname from here. |
| `COMMON_PROTOCOL` | `https` | The *public* URL is https — this is what the app builds links with. |
| `COMMON_DOMAIN_NAME` | bare hostname | No scheme: the scheme lives in `COMMON_PROTOCOL`. |

## The ordering trap

`COMMON_DOMAIN_NAME`'s placeholder is `change_me_domain`, which *also* matches
upstream's secret pattern `change_me_[a-zA-Z0-9_]*`. Randomize the secrets
naively and the domain is silently replaced with hex — the stack then boots
against a nonsense hostname. `up.sh` excludes it and sets the domain
separately, after the tunnel URL is known (upstream sidesteps the same trap by
substituting the domain first).

This is also why the **tunnel starts before the app**: OpenReplay bakes the
public hostname into its config, so it must be known first. Every `up.sh` mints
a *new* URL and rewrites the config — fine for debugging, unworkable for
anything lasting. For that, use a **named** Cloudflare tunnel with a stable
hostname and set `COMMON_DOMAIN_NAME` once.

## Wiring the tracker

After signup, take the project key from the UI:

```
ingestPoint: <url>/ingest
projectKey:  <from the OpenReplay UI>
```

`docs/TODO.md` carries the frontend plan (a `replay` block in the config
schema, passed through the root `+layout.server.ts` to one client-only
component) **and the blockers to settle first**: the registration form's `diet`
field is GDPR Article 9 special-category data and must be masked explicitly,
consent should reuse the existing registration-consent mechanism, users are
identified by platform UUID rather than email, and the e2e suite needs a kill
switch or the tracker fires on every recipe action.

## Cost and caveats

- **2 vCPU / 8 GB RAM / 50 GB disk, x86 only** — below that the backend
  services do not start, which presents as a hang. `doctor.sh` checks all four,
  plus port conflicts and whether the hackagon dev container is already eating
  memory (OpenReplay wants its 8 GB *on top*).
- Upstream documents the Docker Compose path as **experimental**; Kubernetes
  (k3s) is the supported one.
- Quick tunnels are free and best-effort. Session replay is chatty (DOM
  mutations, network, console) — fine for a handful of debug sessions, not for
  a hackathon's worth of traffic.

## Verification status

**Booted for real on 2026-08-08** (Windows host, Docker Desktop, 47 GB / 32
vCPU): all 24 services running, four migrations exited 0, the tunnel serving
200 on `/` and `/signup`, an account created and a project key read back from
`/api/projects`. Sessions recorded from the SvelteKit app arrive and are
stored.

Getting there took **four fixes, and `--dry-run` could not have found any of
them** — it proves the compose files merge, which is a different claim from
"the containers can talk to each other and their scripts can run":

| Symptom | Cause |
| --- | --- |
| `Bind for 0.0.0.0:9001 failed` mid-`up` | upstream publishes minio's console port; the hackagon devcontainer's own rustfs already holds 9000-9001. Overlay unpublishes it, as it already did for caddy. |
| `$'\r': command not found` in `minio-migration`, then an S3 signature mismatch | a Windows host with `core.autocrlf=true` checks the vendored tree out as CRLF. `fetch-upstream.sh` clones with `-c core.autocrlf=false -c core.eol=lf`. |
| `chalice`: `Invalid endpoint: https://change_me_domain` | `ln -s common.env .env` silently degrades to a COPY on MSYS, so compose interpolated a `.env` frozen before the domain was known. `up.sh` copies explicitly, after every edit. |
| `network <id> not found` on every subsequent `up` | `down` ran without `COMPOSE_PROFILES=migration`, so the four migration containers survived holding a reference to the deleted network. A profile-gated service is not an "orphan". |
| public URL answered 502 while every container was healthy | the overlay's `tunnel` named no network, so it landed on compose's implicit `default` — alone. `http://caddy:80` failed to RESOLVE, not to connect. |

## Wiring the app (and unwiring it)

```bash
OPENREPLAY_EMAIL=… OPENREPLAY_PASSWORD=… \
  bash .claude/skills/openreplay-stack/scripts/wire-frontend.sh          # ON
bash .claude/skills/openreplay-stack/scripts/wire-frontend.sh --restore  # OFF
```

It reads the live tunnel URL and the project key from OpenReplay's own API
(a quick tunnel mints a new hostname on every `up.sh`, and a stale
`ingestPoint` fails silently), writes the `replay:` block, and restarts the
frontend. `--restore` puts the config back byte-identical.

**Two servers can own :8081.** process-compose's `frontend` is `vite dev`; the
e2e harness replaces it with the adapter-node build via
`hackathon-e2e/scripts/prod-frontend.sh`, and after a suite run that is what
serves. The built server reads `config.yaml` ONCE at boot, so restarting only
process-compose's copy succeeds, prints "Process frontend restarted", and
changes nothing — the page keeps rendering `replay: null`. `wire-frontend.sh`
bounces both.

## Masking is proved, not configured

`components/frontend/src/lib/components/observability/SessionReplay.svelte`
sets default-deny masking; `hackathon-e2e/tests/openreplay/masking.spec.ts`
types a sentinel into the registration form and greps the tracker's own ingest
bytes for it. It runs an **unmasked control first**, because a zero-hit grep
reads identically whether the string was masked or nothing was ever captured —
and on the first run nothing was.

One hole no option closes: the tracker masks TEXT NODES and input values but
sends ATTRIBUTE values verbatim (only `alt`/`placeholder` are starred, `href`
blanked). `title={userName}` was shipping the signed-in person's name in clear
next to the same name arriving as asterisks. Personal data goes in text nodes,
never in an attribute.
