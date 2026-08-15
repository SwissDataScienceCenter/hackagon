---
name: plausible-stack
description:
  Spin up a self-hosted Plausible Analytics (Community Edition) instance with
  docker compose, behind a Cloudflare quick tunnel so both the dashboard and the
  tracking script have a public origin. Vendors the upstream compose, prepares
  secrets and the owner account non-interactively, wires the SvelteKit app at it
  and back, and proves a page view lands end to end. Use when asked to
  run/try/evaluate Plausible, add privacy-friendly analytics, or count page
  views for the hackathon platform.
---

# Plausible CE behind a quick tunnel

A **development rig**, not a deployment. Three containers plus a tunnel:
Plausible, its own Postgres, its own ClickHouse. Same shape as
`openreplay-stack`, one tenth the weight, and it answers a different question —
"is this page used at all", which the RPC journal structurally cannot see and
session replay is far too heavy to answer.

## Commands

```bash
bash .claude/skills/plausible-stack/scripts/doctor.sh          # preflight
bash .claude/skills/plausible-stack/scripts/up.sh              # fetch, secrets, tunnel, start, owner account, lock down
bash .claude/skills/plausible-stack/scripts/up.sh --dry-run    # everything except `compose up`
bash .claude/skills/plausible-stack/scripts/url.sh --all       # current public URL
bash .claude/skills/plausible-stack/scripts/wire-frontend.sh   # point the app at it
bash .claude/skills/plausible-stack/scripts/verify.sh          # prove it end to end
bash .claude/skills/plausible-stack/scripts/wire-frontend.sh --restore
bash .claude/skills/plausible-stack/scripts/down.sh            # stop, keep the statistics
bash .claude/skills/plausible-stack/scripts/down.sh --volumes  # stop and delete everything
```

`up.sh` needs no input and asks for none: it mints the secrets, registers the
owner, creates the site and a Stats API key, then **closes registration behind
itself** and checks that `/register` refuses.

## Named hostname (`--named`)

`up.sh --named` puts this rig on a **persistent hostname you own** instead of a
quick tunnel, using the same Cloudflare credentials as the app's tunnel —
`PLAUSIBLE_HOSTNAME` in the gitignored `.claude/skills/cloudflare-tunnel/.env`.
See that skill's SKILL.md for the token and its real (zone-wide) scope. Named is
the default when configured; `--quick` forces the old behaviour, which still
needs no account at all.

It matters more here than it looks. **`BASE_URL` is read once at boot** and used
for link generation and the LiveView origin check, so a new hostname means
rewriting `vendor/.env` and recreating the container — and any browser still
holding the old `scriptUrl` posts into a host that no longer exists, which is
indistinguishable from "nobody visited". With a stable hostname the wiring
written by `wire-frontend.sh` stays true across restarts, and `up.sh --named`
skips the "start a tunnel just to find out what it is called" phase entirely.

Only one tunnel runs at a time: `--named` stops the quick tunnel and vice versa,
because `BASE_URL` names exactly one of them and a dashboard reached on the
other renders and then never loads any numbers.

## Layout

```
compose.tunnel.yaml    overlay: adds cloudflared, publishes :8010 on loopback
scripts/               doctor · fetch-upstream · secrets · up · url · down
                       signup        (owner + site + Stats API key, via `bin/plausible rpc`)
                       wire-frontend (point the app at this rig, and back)
                       verify        (9 checks, ending at Plausible's own API)
                       pageview.mjs  (drives a real Firefox; used by verify)
vendor/                upstream compose.yml + clickhouse/ (fetched, gitignored)
vendor/UPSTREAM.txt    repo, ref, exact commit and the image tag
vendor/.env            what compose interpolates (generated)
.state/                tunnel URL (gitignored)
.secrets.env           owner credentials, SECRET_KEY_BASE, API key (gitignored)
```

`vendor/` is fetched at a pinned tag (`PLAUSIBLE_REF`, default `v3.2.1`) rather
than committed: **the compose file IS the version** — the image tag lives inside
it — so the ref pinned here and the release running are one decision.

## Why the tunnel starts first

Plausible reads `BASE_URL` **at boot** and uses it for link generation and for
the LiveView origin check, so a dashboard booted against the wrong hostname
serves HTML and then fails to connect its own websocket: a page that renders and
never loads any numbers. `up.sh` therefore starts `tunnel` alone (`--no-deps`),
reads the URL out of cloudflared's log, writes it, and only then starts the app.
Same ordering trap as openreplay-stack's `COMMON_DOMAIN_NAME`, and the same
consequence: **every `up.sh` mints a new URL**, so this is a debugging tool. A
lasting instance wants a named tunnel and a fixed `BASE_URL`.

Two differences from that rig, both easy to get backwards:

|                      | openreplay-stack                                      | here                                                                     |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| tunnel's `networks:` | must name `openreplay-net` — upstream defines one     | must name NOTHING — upstream defines none, so everything is on `default` |
| public hostname      | bare host in `COMMON_DOMAIN_NAME` + `COMMON_PROTOCOL` | full URL in `BASE_URL`, scheme included                                  |

Getting either wrong produces the same symptom: a 502 on the public URL with
every container healthy.

## The owner account, and why signup is an `rpc`

Plausible CE seeds no account; whoever registers first owns the instance, and
with no mailer configured there is **no recovery path**. So the credentials are
generated into `.secrets.env` and the account is created from them —
`openreplay-stack` learned this by having to wipe its volumes once.

The HTTP route _looks_ scriptable and is not. `GET /register` serves a form with
`user[name]`, `user[email]`, `user[password]`, `user[password_confirmation]` and
a CSRF token; **`POST /register` is 404.** The form is a LiveView
(`phx-submit="register"`) — the account is created by a handler on the
websocket, and the form's own `action="/login"` only signs the new user in
afterwards. `signup.sh` therefore runs Elixir inside the release with
`bin/plausible rpc`, which is what that handler would have done.

The cost, written down rather than discovered: that code names internal
functions (`Plausible.Auth.User.new/1`, `Plausible.Sites.create/2`,
`Plausible.Auth.create_stats_api_key/4`), so it is pinned to the version in
`vendor/UPSTREAM.txt` in a way an HTTP call would not be. Every step matches on
its expected result, so a moved API fails loudly instead of half-working.

`.secrets.env` sits OUTSIDE `.state/` on purpose: it must survive `down.sh` and
even `--volumes`, so that a wipe is the RECOVERY path (the next `up.sh`
re-creates the same account) and not a second lockout. `secrets.sh` refuses to
write it at all if `git check-ignore` does not cover it.

**Registration is closed after the account exists.** A quick-tunnel URL is
unguessable, not private, and an open `/register` on it is an invitation. The
check that matters is the one after the restart: "the variable is set" and "the
route refuses" are different claims, and only the second is verified.

## Wiring the app

```bash
bash .claude/skills/plausible-stack/scripts/wire-frontend.sh            # ON
bash .claude/skills/plausible-stack/scripts/wire-frontend.sh --print    # show, change nothing
bash .claude/skills/plausible-stack/scripts/wire-frontend.sh --restore  # OFF
```

It writes **`config.local.yaml`, never the tracked `config.yaml`** — the value
is a `*.trycloudflare.com` hostname that dies in a few hours, and this repo has
already had one of those committed and left dead in HEAD for several commits.
`internal/config/config_test.go` asserts both tracked configs still say
`localhost`; `verify.sh` re-checks it too.

**This is the THIRD writer of that overlay** (`oidc` ← cloudflare-tunnel,
`replay` ← openreplay-stack, `plausible` ← here), and none of them knows about
the others, so `--restore` removes the **block** and never the file.
`.claude/skills/lib/config-overlay.sh` does the per-key surgery and deletes the
file only when the last key leaves it. An `rm` here would silently break login
(a tunnel with no issuer keeps serving every page) or stop session replay (an
empty OpenReplay UI looks exactly like the correct default).

⚠ **Anything that READS this config must read the MERGED view.** Wiring writes
the overlay, so a reader that looked only at `config.yaml` finds `enabled`
absent on a perfectly wired machine, self-skips, and reports success having
checked nothing — precisely how the replay suite once passed while testing
nothing. `verify.sh` reads both.

### The script variant is two decisions

`…/js/script.local.manual.js`, and both parts are load-bearing:

- **`local`** — the stock script refuses to send from a local address. Read out
  of the served file, not the docs:
  `/localhost$|^127(\.[0-9]+){0,2}\.[0-9]+$|^\[::1?\]$/.test(location.hostname)`.
  The dev app is `http://localhost:8081`, so without this variant every page
  view is dropped **by the browser** — everything looks wired and nothing
  arrives.
- **`manual`** — the stock script otherwise sends a pageview by itself, using
  `location.href`. That URL is the one thing this integration must never send.
  Manual mode means every page view is one the app decided to send, with a URL
  it built.

`verify.sh` asserts both properties of the fetched script, because a wiring that
names the wrong variant is invisible until somebody asks why the dashboard is
empty.

### Unwire before running an e2e suite

Nothing breaks if you do not — the tracker's POSTs are fire-and-forget and no
suite asserts about them — but a journey run is 465 actions of page loads, so
the numbers become mostly Playwright. `run.sh` does NOT borrow this block away
(the same decision as for `replay`: a suite should see what a visitor sees), so
it is a manual `wire-frontend.sh --restore` before, and a re-wire after.

## Privacy: the decisions, not the defaults

Full statement in **`docs/frontend/analytics.md`**. The short version:

- **The URL is never sent.** `u` is SvelteKit's ROUTE ID —
  `/my/hackathon/[id]/teams` — so it cannot contain an id, because it never
  touched one. `/invite/<token>` (that token is a working credential) is
  reported as `/invite/[token]`. Query strings are dropped, so `utm_*` is not
  recorded either. The trade is accepted and stated: no per-hackathon
  breakdowns, ever.
- **Cookieless, and that is the property consent turns on.** Nothing is stored
  in or read from the browser.
- **Plausible still sees the IP and the user agent**, and hashes them with a
  daily-rotated salt to count unique visitors. Only the hash is stored —
  verified against `system.columns`, which shows no IP or user-agent column in
  `events_v2`/`sessions_v2`, rather than against a marketing page. No
  geolocation database is shipped, so country/city stay empty.
- **It sits OUTSIDE the session-replay consent gate**, deliberately: that banner
  asks about session RECORDING, and consent is scoped to what was asked. A
  second banner would ask about something with no artefact to permit or
  withdraw. `DNT`/GPC still suppress it, before the script is fetched.
- **Nothing is correlated.** No user id, session id or replay id is ever sent;
  these counts cannot be joined to the RPC journal or to a replay.

## Cost, measured

Idle, on this machine, with the app stack and the openreplay rig also running:

| container                          | RSS          | image    |
| ---------------------------------- | ------------ | -------- |
| `plausible`                        | 431 MB       | 265 MB   |
| `plausible_events_db` (ClickHouse) | 188 MB       | 718 MB   |
| `plausible_db` (Postgres 16)       | 110 MB       | 396 MB   |
| `tunnel`                           | 18 MB        | —        |
| **total**                          | **≈ 750 MB** | ≈ 1.4 GB |

Volumes after the first few page views: ~80 MB, nearly all of it Postgres's
initial database.

**It coexists with the openreplay rig comfortably** — that one wants 8 GB _of
its own_, this one runs in under one, and the two were up together throughout
the verification below. Upstream recommends 2 GB RAM; the measured idle
footprint is well under that, and ClickHouse is configured small by upstream's
own `clickhouse/low-resources.xml`.

Ports: **one**, `127.0.0.1:8010` (override `PLAUSIBLE_PORT`). Not upstream's
8000 — the most contested port on a developer machine, and a collision fails
`compose up` after the databases have started, which reads as a stack failure
rather than a clash. Loopback only; the tunnel is the entrypoint.

## Verification status

**Verified on 2026-08-14** against CE v3.2.1 (commit `ec6c4da`), Windows host,
Docker Desktop. `verify.sh` — all nine checks:

1. every compose service has a running container
2. the dashboard answers **through the tunnel**, with a real login round-trip
   (CSRF → `POST /login` → 302 → `/sites` lists the site)
3. `/register` refuses signup on that public URL
4. the app is wired, read from the **merged** config, and the tracked
   `config.yaml` still says `localhost`
5. the tracker script is fetchable and is the `local` + `manual` variant
6. **a real Firefox** visits `/`, clicks through to `/hackathon/<uuid>` and
   opens `/invite/<token>`; the captured POST bodies carry `/`,
   `/hackathon/[id]`, `/invite/[token]` and **no UUID, no token, no internal
   referrer**
7. **Plausible's own Stats API** returns those three pages for today
8. `events_v2`/`sessions_v2` have no IP or user-agent column
9. `--restore` removes `plausible` and leaves `oidc` and `replay` intact
   (simulated on a copy; also done for real once, with both surviving)

Step 6 does not self-skip. Without `--no-browser`, an unavailable browser is a
**failure**: a proof that quietly drops its own hardest step is how this repo
has been lied to before. Unwired, the same script records **zero** requests —
which is the other half of "absent config ⇒ absent script".

The **wipe-and-recover** claim is verified too, not just written down:
`down.sh --volumes` (databases gone, frontend unwired, `oidc`/`replay` intact) →
`up.sh` → a new tunnel URL, the SAME owner account re-created from
`.secrets.env`, the site re-created, registration closed again → re-wire →
`verify.sh` green. All nine checks above were re-run after that cycle.

**That round-trip found a bug that only a real wipe could show.** The Stats API
key survives in `.secrets.env` by design, but its ROW was in the wiped database
— so `signup.sh`'s "is the key set" test was true and useless, and the first
thing to notice would have been a 401 in `verify.sh` step 7, pointing nowhere
near the cause. It probes the key against the Stats API now and mints a new one
when the answer is not 200. A file that outlives the thing it describes is not a
cache; it is a claim that needs checking.

Playwright and Firefox are borrowed from the sibling `hackathon-e2e` skill (the
only place they are installed), through a `createRequire` anchored at that
package — ESM resolves bare specifiers relative to the FILE, and `cd`-ing does
not help.

### Two traps this cost, both worth keeping

**A carriage return inside a secret.** Git Bash's `openssl` prints CRLF, so
`openssl rand -base64 32 | tr -d '\n'` leaves a `\r` at the END OF THE VALUE —
no longer a line ending, just a byte in a secret. Plausible then refuses to boot
with `TOTP_VAULT_KEY must be Base64 encoded 32 bytes` about a key that decodes
to exactly 32 bytes in every tool you check it with. It survives every obvious
check: `cat -A` on a file `sed` has since rewritten shows nothing (MSYS strips
CRs on the way through), `docker compose config` shows it clean because that
reads `.env` rather than the process environment, and
`docker inspect --format '{{range .Config.Env}}'` renders the CR as the line
break it looks like. Only `{{json .Config.Env}}` shows it. Stripped in three
places now — at generation, on read, and on write into `.env` — because a
`.secrets.env` already on disk is not fixed by fixing the generator.

**`curl -o /dev/null` on a Windows host.** `lib.sh` exports `MSYS_NO_PATHCONV=1`
(docker needs its own `/container/paths` left alone), so `/dev/null` reaches
`curl.exe` verbatim, which tries to create a file at that literal path and
prints `curl: (23) client returned ERROR on write` — in the middle of a check
that then PASSES, because `-w '%{http_code}'` already produced the number. Use
`$CURL_DISCARD`. The same shape bites `curl … | grep … | head`: head closes the
pipe at the first match while curl is still writing. Capture, then match.

**A restart that stops a server and does not start it.** The first
`wire-frontend.sh` ran its restarts as `cmd && cmd` with output on `/dev/null`,
and left the app tunnel's only upstream (`:8082`) stopped while printing
"analytics is ON". The public URL kept answering — caddy falls back to `:8081` —
right up until that was down too. Every restart step now captures its output,
prints `ok`/`FAILED`, and names the port that is down. **Three** servers can be
serving this app (process-compose's vite, `prod-frontend.sh` on :8081,
`prod-serve.sh` on :8082 for the tunnel), and the built ones read their config
once at boot, so all three are bounced.
