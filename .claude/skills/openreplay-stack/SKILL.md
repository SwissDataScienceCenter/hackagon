---
name: openreplay-stack
description: Spin up a self-hosted OpenReplay (session replay) instance with docker compose, behind a Cloudflare quick tunnel so the tracker can reach it from a browser. Vendors the upstream compose into the skill folder, prepares secrets non-interactively, and points the stack at the tunnel URL. Use when asked to run/try/evaluate OpenReplay, set up session replay, or get a public ingest endpoint for the tracker.
---

# OpenReplay behind a quick tunnel

A **debugging rig**, not a deployment. It brings up the full upstream stack
(23 long-running services, plus four one-shot migration containers) with a
`*.trycloudflare.com` URL in front, so you can wire the SvelteKit tracker to a
real ingest endpoint without owning a domain or a VM.

## Commands

```bash
bash .claude/skills/openreplay-stack/scripts/doctor.sh          # preflight — run this first
bash .claude/skills/openreplay-stack/scripts/up.sh              # fetch, prepare, tunnel, start, admin account
bash .claude/skills/openreplay-stack/scripts/up.sh --dry-run    # everything except `compose up`
bash .claude/skills/openreplay-stack/scripts/url.sh             # current public URL
bash .claude/skills/openreplay-stack/scripts/signup.sh          # (re)ensure the admin account — up.sh already does
bash .claude/skills/openreplay-stack/scripts/retention.sh       # what is past the cutoff (dry run)
bash .claude/skills/openreplay-stack/scripts/down.sh            # stop, keep recorded sessions
bash .claude/skills/openreplay-stack/scripts/down.sh --volumes  # stop and delete everything
```

First run pulls ~25 images and runs DB migrations — expect a long wait. There
is no signing up by hand: **`up.sh` creates the admin account itself** from
`.secrets.env` (see below) and prints the project key when done.

## Layout

```
compose.tunnel.yaml    overlay: adds cloudflared, unpublishes caddy's and minio's host ports
scripts/               doctor · fetch-upstream · up · url · down
                       signup (create the admin account from .secrets.env)
                       wire-frontend (point the app at this rig, and back)
                       retention (purge expired sessions — see below)
vendor/                upstream scripts/docker-compose/ (fetched, gitignored)
vendor/UPSTREAM.txt    repo, ref and exact commit — a fetch is reproducible
.state/                tunnel URL, "secrets prepared" marker (gitignored)
.secrets.env           admin email + password (generated, gitignored — see below)
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

## The admin account, and where its password lives

OpenReplay seeds no account: the first signup at `<url>/signup` becomes the
admin, and there is no recovery path — an admin created by hand with an
unrecorded password once made the dashboard permanently unreachable, and the
only fix was `down.sh --volumes`. So `up.sh` runs `scripts/signup.sh`, which
polls `GET /api/signup` until it answers, and:

- `tenants: false` → `POST /api/signup` with
  `{email, password, fullname, organizationName}` (the route read from
  chalice's `routers/core_dynamic.py`; it is only registered while no tenant
  exists, which is why the GET is always checked first), then verifies a
  `POST /api/login` with the stored credentials and prints the project key.
- `tenants: true` → skips signup, still verifies the login. A failed login
  here WARNS and exits 0 — an existing account must never fail a bring-up —
  and names the two ways out (fix `.secrets.env`, or wipe).

**Credentials live in `.secrets.env`** (skill root), generated on first run —
`openssl rand -hex 16` — shown once, then readable only from the file. Chosen
because it is the repo's existing convention for dev secrets
(`.devcontainer/post-create.sh` mints the gitignored `secrets.yaml` the same
way), because `sops`/`age` are not in the toolchain and this script runs on
the HOST anyway, and because env-vars-only would recreate exactly the
lost-password incident on the next machine. Environment variables override the
file when set. The file sits OUTSIDE `.state/` on purpose: it must survive
`down.sh` and even `--volumes` — after a wipe, the next `up.sh` re-creates
the same account from it, so the wipe is the recovery path and not a second
loss. It is gitignored in the skill's own `.gitignore` (which is what protects
it on `feat/claude`, where the skill is tracked), and `signup.sh` refuses to
write it at all if git would not ignore it.

## Wiring the tracker

`up.sh` prints the project key after creating the account (or
`wire-frontend.sh --print` shows it any time):

```
ingestPoint: <url>/ingest
projectKey:  <printed by up.sh / signup.sh>
```

`docs/frontend/session-replay.md` is the statement of what this collects, when,
and on whose say-so — read it before pointing the tracker at anything real.

Two of the original blockers were settled differently from the plan, and
`docs/TODO.md` records why. `diet` needed no per-field rule (masking is
default-deny, so every input is hidden and every text node starred), and
consent could **not** reuse the registration-consent mechanism: that is an
agreement with one event, keyed `(hackathon, user)`, while the tracker runs
before an event is chosen and for visitors who have no `User` row. It is a
first-party cookie instead, read server-side.

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
vCPU): all 23 services running, four migrations exited 0, the tunnel serving
200 on `/` and `/signup`, an account created and a project key read back from
`/api/projects`. Sessions recorded from the SvelteKit app arrive and are
stored, and the e2e `openreplay` project passes against it (7 tests: consent,
masking, Do Not Track — plus the 4 auth-setup tests it depends on).

Getting there took **five fixes, and `--dry-run` could not have found any of
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
bash .claude/skills/openreplay-stack/scripts/wire-frontend.sh            # ON
bash .claude/skills/openreplay-stack/scripts/wire-frontend.sh --restore  # OFF
```

It reads the live tunnel URL and the project key from OpenReplay's own API
(a quick tunnel mints a new hostname on every `up.sh`, and a stale
`ingestPoint` fails silently), writes the `replay:` block, and restarts the
frontend. Credentials come from `.secrets.env` automatically; `OPENREPLAY_EMAIL`
/ `OPENREPLAY_PASSWORD` in the environment override it, and
`OPENREPLAY_PROJECT_KEY` skips the login entirely.

Or get the whole thing — stack, rig, wiring and the recording proof — in one
command: `devcontainer-up/scripts/start.sh --replay`.

**It writes `config.local.yaml`, never the tracked `config.yaml`.** The block
carries a `*.trycloudflare.com` ingest hostname that is this machine's for the
next few hours; a `sed` into the tracked file left a wired dev machine with a
dirty working tree, which is how the tunnel's OIDC issuer once got committed and
sat dead in HEAD for several commits. The overlay is gitignored and deep-merged
over `config.yaml` by the same loader, validated by the same schema.

**That file has two writers**, and they do not know about each other:
`cloudflare-tunnel/scripts/auth-wire.sh` owns `oidc`, this script owns `replay`.
So `--restore` removes the **block**, not the file —
`.claude/skills/lib/config-overlay.sh` does the per-key edit for both, and
deletes the file only when the last key leaves it. Clobbering the overlay would
be invisible in both directions: dropping `replay` stops recording, and an
empty OpenReplay UI already looks like the correct default; dropping `oidc`
leaves the tunnel serving every page and breaks only login. The second one is
not hypothetical — `hackathon-e2e/scripts/run.sh` calls `auth-wire.sh --restore`
on the way into every suite run.

⚠ **Anything reading the replay config must read the MERGED view.**
`tests/openreplay/capture.ts` reads `config.yaml` overlaid with
`config.local.yaml`, because a reader that only looked at the tracked file would
find `enabled` absent on a perfectly well-wired machine — every spec in that
folder would `test.skip`, and the suite would report green having verified
nothing about masking, consent or Do Not Track.

**Two servers can own :8081.** process-compose's `frontend` is `vite dev`; the
e2e harness replaces it with the adapter-node build via
`hackathon-e2e/scripts/prod-frontend.sh`, and after a suite run that is what
serves. The built server reads its config ONCE at boot, so restarting only
process-compose's copy succeeds, prints "Process frontend restarted", and
changes nothing — the page keeps rendering `replay: null`. `wire-frontend.sh`
bounces both.

## Retention: there isn't one, so there's a script

Upstream's compose distribution has **no session-retention setting** — checked,
not assumed. `vendor/docker-envs/*.env` has nothing of the kind (`FS_CLEAN_HRS`
is about a container's own scratch files), and `experimental.sessions` in
`vendor/migration-files/init_ch_schema.sql` carries no TTL. Retention limits
are an EE feature. Left alone, a self-hosted rig keeps every recording of every
visitor forever.

```bash
bash scripts/retention.sh                              # dry run, 30 days
bash scripts/retention.sh --days 30 --apply            # purge
bash scripts/retention.sh --days 30 --apply --install-ttl
```

**A session lives in four places**, and deleting from one leaves the others
holding the same visit:

| Where | What | How it is deleted |
| --- | --- | --- |
| object store | `mobs/<session_id>/dom.mobs`, `/devtools.mob` — the recording itself | boto3 inside `chalice`, which already holds the S3 credentials |
| Postgres | `public.sessions` + ~20 event tables | one `DELETE` on the parent; every FK is `ON DELETE CASCADE` (verified against `pg_constraint`) |
| ClickHouse | `experimental.sessions`, `product_analytics.events`, the by-`session_id` tables | `ALTER … DELETE`, plus an optional declarative TTL |
| Hackagon | nothing, by design — there is no session id on our side | — |

**Order is not arbitrary.** Postgres is where the expired ids are *enumerated*,
so it is deleted **last**. An interrupted run then leaves rows pointing at
nothing, which the next run fixes; the reverse order would leave recordings
that nothing can enumerate any more — undeletable except by wiping the bucket.

`--install-ttl` is the closest thing to a built-in setting (ClickHouse expires
parts on its own, no cron), but it reaches neither the recordings nor Postgres,
which is where the actual personal data is. It supplements the purge; it does
not replace it.

## Consent: nobody is recorded who did not say yes

Wiring this rig up no longer means "every visitor to localhost:8081 is
recorded". A deployment switch (`replay.enabled`) and a per-browser consent
must **both** be on, and the consent is the visitor's — asked by a banner,
withdrawable at `/account`, honoured before the tracker's config is ever sent
to the page. A browser sending `DNT: 1` is not recorded even if it consented
(`tests/openreplay/dnt.spec.ts`). `docs/frontend/session-replay.md` is the full
statement; the proof is `hackathon-e2e/tests/openreplay/consent.spec.ts`, which
counts bytes on the wire rather than asserting that a flag was read.

Practical consequence for anyone driving this rig by hand: **after wiring, load
a page and click "Allow recording"**, or the OpenReplay UI will stay empty and
look broken.

## Three ways this rig looks healthy and records nothing watchable

Found on 2026-08-11, after every session in the UI spun forever. **Not one of
them could turn a spec red**, because every replay spec measured bytes leaving
the BROWSER and all three faults are downstream of the ingest endpoint — which
answered `200` to every batch throughout.

| Fault | How it presents | Fix |
| --- | --- | --- |
| the `sink` container was not running | nothing. `docker compose ps` lists what IS there; a service whose container was removed reads exactly like one that was never meant to run. sink writes the raw session file every later stage reads, so no mob file was ever produced. | `up.sh` (or `compose up -d sink-openreplay`). `doctor.sh` now compares `compose config --services` against what is running and fails on the difference. |
| the object store answered `NoSuchBucket` for `mobs` | uploads failed silently; the bucket, its metadata and previously written objects were all present on disk, and a signed `PUT` still 404'd. | `docker restart minio`. Confirmed by signing a request by hand: 404 before, 200 and 7 kB of zstd after. |
| `ender`: `batch meta not at the start of batch`, once per session | a `broken batch(es)` warning at session end. `Iterate` (backend/pkg/messages/iterator.go) RETURNS on the first parse error, so a rejected batch is dropped WHOLE. | **Not ours and not fixed** — every batch the tracker posts was verified well-formed (`playable.spec.ts` walks each one and locates every `BatchMetadata`). It costs one batch per session; the recording still lands and plays. |

The lasting guard is `hackathon-e2e/tests/openreplay/playable.spec.ts`, which
asks the far end whether the session became a recording instead of trusting a
`200`. It needs `.secrets.env` — reading a stored mob is authenticated — and
deliberately does NOT self-skip when that file is missing.

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
