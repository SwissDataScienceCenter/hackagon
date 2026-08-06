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

Fetch, secret preparation, compose merge and `--dry-run` are **verified on
this repo** (24 services resolve, including the tunnel). A full `up.sh` has
**not** been run here — it pulls ~25 images and the machine had ~54 GB free
against a 50 GB requirement, so the first real boot is yours to make. If it
fails, `docker compose -p openreplay logs <service>` and the migration
services (`db-migration`, `clickhouse-migration`) are where to look first.
