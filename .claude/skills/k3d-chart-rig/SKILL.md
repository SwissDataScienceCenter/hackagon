---
name: k3d-chart-rig
description: Install and exercise this repo's Helm chart on a throwaway local Kubernetes cluster (k3d + ingress-nginx + a test-only object store), then prove the things a rendered manifest can only assert — that a presigned upload survives the /objects Host rewrite, that the regex path beats the frontend's /, that ingress-nginx accepts the ExternalName upstream, and that a real OIDC login round-trip completes. Use when asked to test, install, debug or change helm-chart/, or to reproduce a Kubernetes-only failure.
---

# A local Kubernetes rig for `helm-chart/`

The chart renders and lints. Nothing had ever installed it. This makes the
difference observable.

```bash
bash .claude/skills/k3d-chart-rig/scripts/up.sh       # ~4 min cold, ~90 s warm
bash .claude/skills/k3d-chart-rig/scripts/verify.sh   # 37 checks, ~2 min
bash .claude/skills/k3d-chart-rig/scripts/down.sh     # deletes the cluster
```

…and, optionally, the same cluster on a **real public hostname with a real
certificate** (needs the Cloudflare credentials the other tunnels use):

```bash
bash .claude/skills/k3d-chart-rig/scripts/tunnel.sh up       # ~2 min
bash .claude/skills/k3d-chart-rig/scripts/verify.sh          # the same 37, over https
bash .claude/skills/k3d-chart-rig/scripts/browser-check.sh   # 13 checks a browser must answer
bash .claude/skills/k3d-chart-rig/scripts/tunnel.sh down     # back to *.localhost
bash .claude/skills/k3d-chart-rig/scripts/tunnel.sh destroy  # …and give the names up
```

**Opt-in, loopback-only, and it imports development accounts** — see the warning
at the bottom before running it on a machine anyone else can reach.

## What it is

k3d (k3s in Docker) as **sibling containers on the host Docker daemon**. Three
containers: `k3d-hackagon-server-0` (the whole cluster), `-serverlb` (the port
proxy) and a short-lived `-tools`. Not docker-in-docker: no privileged
container, no nested storage driver.

> The task that commissioned this assumed the devcontainer could drive it,
> because "the devcontainer already speaks to the host socket". **It does not** —
> `.devcontainer/docker-compose.yml` mounts no Docker socket and the image has
> no `docker` CLI. Everything here therefore runs from the **host** shell (Git
> Bash on Windows), which is also where `docker` and the pinned toolchain live.

```
scripts/lib.sh      names, ports, hostnames, tool wrappers, path translation
scripts/tools.sh    downloads pinned k3d / helm / kubectl into bin/ (gitignored)
scripts/up.sh       cluster → ingress-nginx → CoreDNS → store → secrets → helm
scripts/install.sh  just the `helm upgrade`, for iterating on the chart
scripts/verify.sh   the 37 checks — in EITHER mode
scripts/presign.sh  SigV4 presigner mirroring internal/storage/sigv4.go
scripts/tunnel.sh   the public-https mode: up / down / destroy / status
scripts/browser-check.sh + browser-login.mjs   a real browser, the 13 checks
                    that need one (see "Real HTTPS", below)
scripts/down.sh     delete (or --stop, or --purge)
manifests/          ingress-nginx values · the test store · the negative control
helm-chart/values.k3d.yaml   the test values (TRACKED, and carries no secret)
.state/values.tunnel.yaml    the public-https overlay (GENERATED, gitignored —
                    it names a hostname, and nothing tracked ever does)
```

## Ports it claims on the host

| Port | What | Why not a dev-stack port |
| --- | --- | --- |
| **8090** | ingress-nginx http — the app | dev uses 3000 · 8081 · 8082 · 8180 · 15432 · 9000 · 9001 · 8010 |
| **8443** | ingress-nginx https — Keycloak only | " |
| **6551** | k3s apiserver, bound to `127.0.0.1` | " |

The public-https mode claims **no further host port**: cloudflared joins the
`k3d-hackagon` docker network and dials the load balancer container directly, so
the tunnel adds a container and nothing that any other rig could collide with.

Nothing else is published, nothing binds `0.0.0.0` except the two ingress ports
(Docker's default), and the compose project, the dev stack's three tunnels and
`~/.kube/config` are untouched — k3d is called with `--kubeconfig-update-default=false` and every
wrapper points at the rig's own `.state/kubeconfig.yaml`.

## What it costs

| | |
| --- | --- |
| RAM | **~2.7 GB** resident with everything up (`k3d-…-server-0` 2.64 GiB) |
| Disk | **~4.6 GB**: 4.1 GB of images inside the node's containerd, ~420 MB of k3d/k3s images in the host cache, ~46 MB of pinned binaries in `bin/` |
| Time | measured: **68 s** to create the cluster + **123 s** for ingress-nginx, CoreDNS, the store, the secrets and `helm install` — ~3.2 min from nothing, with every in-cluster image pulled fresh. `verify.sh` is ~2 min (two ingress-controller rollouts). |

The frontend image alone is 1.17 GB (Nix-based). `down.sh` takes the 4.1 GB with
the cluster and prints what is left in the host cache; keeping those saves ~40 s
of the next run, and the in-cluster pulls happen again either way because a new
node starts with an empty containerd.

## The three decisions worth knowing

**Traefik is disabled and ingress-nginx installed in its place.** k3d bundles
Traefik, and every annotation the chart writes on the `/objects` Ingress —
`upstream-vhost`, `rewrite-target`, `use-regex`, `proxy-body-size` — is
ingress-nginx's. The Host rewrite is not expressible in a core Ingress object on
Traefik at all. With the bundled controller the one thing this rig exists to
test cannot work, so `up.sh` passes `--disable=traefik`.

**The controller listens on 8090 in-cluster, not on 80.** The OIDC issuer is ONE
string: the browser follows it to Keycloak and the frontend POD fetches the
discovery document from it, and Auth.js rejects a document whose `issuer`
differs from the configured one. Making the in-cluster port equal the host port
is what lets one URL be true from both sides. CoreDNS is then taught to answer
`app.` and `auth.hackagon.localhost` with the controller's Service — via a
`rewrite` in the `coredns-custom` ConfigMap, **not a `hosts` block**: k3s's
Corefile already has one, a second makes CoreDNS refuse to start ("this plugin
can only be used once per Server Block") and takes cluster DNS down with it.

**`*.localhost`, not nip.io or sslip.io.** Measured on the machine this was
written on: the local resolver applies DNS-rebinding protection and returns
nothing for `app.127.0.0.1.nip.io`, while the same query to `8.8.8.8` answers
`127.0.0.1`. Whether a wildcard-DNS service works is a property of whoever runs
DNS for the developer. `*.localhost` needs no resolver at all — curl (≥ 7.77)
and every Chromium, plus Firefox ≥ 84, map it to loopback themselves (RFC 6761)
— and nothing is written to any hosts file.

## The app is on http and Keycloak is on https, on purpose

Not an oversight, and not laziness in either direction.

**Keycloak needs TLS.** Its `AUTH_SESSION_ID` / `KC_RESTART` cookies are in the
FEDERATION scope, which is `SameSite=None`, which forces `Secure` — whatever
scheme it is reached over. Measured before the split: over http Keycloak
answered `Set-Cookie: AUTH_SESSION_ID=…;Secure;HttpOnly;SameSite=None`, curl
discarded them per the cookie spec, and the login POST came back 400 "session
expired, it may have been deleted or cookies are disabled". No chart change
could fix that. (A browser would have completed it — `*.localhost` is a
potentially-trustworthy origin, so Chrome and Firefox accept Secure cookies
there over http. curl has no such exception, and a check that only passes in a
browser is a check this rig cannot run.) `up.sh` mints a 90-day self-signed
certificate into the Secret name the chart already defaults to.

**The app stays on http, and that half is load-bearing.** The SvelteKit node
adapter INFERS the public scheme, and its unconfigured guess is the literal
string `https`. An https-everywhere rig would agree with that guess by accident
and prove nothing. On http, a frontend that guesses wrong advertises https
callback URLs, issues `__Secure-` cookies the browser will not send back, and
login dies — with every page still answering 200. That is exactly what happened
here, and it is what `frontend.protocolHeader` now prevents.

**That argument has since been checked from the other side, and it held.**
`scripts/tunnel.sh` runs the same cluster behind real edge-terminated TLS: over
https, removing `protocolHeader` breaks nothing at all, because the guess is
right by accident. Which is exactly the state this mode exists not to be in.
**Keep both.**

## …and a second mode with REAL https, which is the other half

`scripts/tunnel.sh up` publishes the SAME cluster through a **named Cloudflare
tunnel** on a zone we own. Nothing is simulated: DNS is public, the certificate
is the zone's real one, and a browser verifies it.

```
browser ──https──▶ Cloudflare edge ──tunnel──▶ cloudflared ──http──▶
                   ingress-nginx :8090 ──▶ frontend · Keycloak · the store
```

**TLS terminates at the edge and the origin stays plain http.** That is not a
shortcut, it is the shape a deployment behind any TLS-terminating proxy has, and
it is the only shape in which `frontend.protocolHeader` has an input: cloudflared
is what puts `X-Forwarded-Proto: https` on the request the cluster receives.

**Two hostnames, one tunnel.** The chart routes the app and Keycloak by HOST on
two separate Ingresses, so there is no single name that reaches both.

| | |
| --- | --- |
| app | `k3d-hackagon.example.org` |
| Keycloak | `k3d-auth-hackagon.example.org` |
| origin | `http://k3d-hackagon-serverlb:8090` on the `k3d-hackagon` docker network |

⚠ **Both names are ONE label deep and that is a constraint, not a style.**
Cloudflare's free Universal SSL covers the apex and one label and nothing below
it. Measured against the edge before any record was created: SNI
`auth.k3d-hackagon.example.org` gets **TLS alert 40, handshake
failure**, while a one-label sibling gets the zone's certificate. A browser
reads that as a broken site, not as a missing certificate.

**The port property is REPLACED, not dropped.** In the localhost mode the
controller listens on 8090 in-cluster as well as on the host so that one issuer
string is true from both sides. A public https URL names no port at all, so the
replacement is stronger: the frontend POD resolves the same public hostname
through public DNS and reaches Keycloak the way the browser does — out to
Cloudflare and back down the tunnel, over the same real certificate. There is one
URL and one path to it, so there is nothing left to disagree. Measured from
inside the cluster before this was built: a pod resolves and reaches
Cloudflare-proxied names over IPv4 in ~290 ms.

That also **removes `NODE_TLS_REJECT_UNAUTHORIZED=0`**, the line values.k3d.yaml
calls the worst in the file. It is there because the frontend has to accept the
self-signed Keycloak certificate; on a real one it does not, so the overlay sets
`frontend.extraEnv: []` and the pod runs with node's trust store intact.

### What a browser answers and curl cannot

`browser-check.sh` (13 checks, Firefox, driven inside the devcontainer where the
e2e suite's Playwright already lives). It exists for one reason: **`__Secure-` is
a rule about the USER AGENT.** A browser must refuse to store a `__Secure-`
cookie that did not arrive over a secure connection. curl implements no such
rule — it would keep and replay that cookie over plain http — so a green curl
login is equally consistent with the prefix working and with it being ignored.

Observed, signing alice in through the public URL: the callback sets
`__Secure-authjs.session-token` (`Secure; HttpOnly; SameSite=Lax`), Firefox
stores it, no unprefixed twin is set beside it, `/auth/session` fetched from the
page returns alice and a Keycloak access token, and it survives a full page load.
On the `*.localhost` mode `cookies.useSecure` is false and none of that is
reachable.

### The chain, broken and put back

Three experiments, because a fix you can break and restore is a fix you have
proven. All three are single commands and all three were run.

| change | advertised origin through the tunnel | sign-in POST |
| --- | --- | --- |
| baseline | `https://k3d-sdsc-hackathons…` | 302 |
| ingress-nginx `use-forwarded-headers: false` | `http://k3d-sdsc-hackathons…` | **403** |
| chart `frontend.protocolHeader: ""` | `https://k3d-sdsc-hackathons…` | 302 |

The 403's body is SvelteKit's own `Cross-site POST form submissions are
forbidden`: the app computed an http origin, the browser sent an https `Origin`,
and the CSRF check refused them. Every page still answered 200.

**And the third row is the honest result: under real https, removing
`protocolHeader` breaks nothing.** adapter-node's unconfigured guess is the
literal string `https`, which is correct here by accident — which is precisely
why the app is on plain http in the default mode, and why that asymmetry is
worth keeping. What is load-bearing over https is the header being TRUE, and
`protocolHeader` is what makes the scheme observed rather than guessed.

The cheapest proof that it is READ at all needs no restart and no downtime —
**same pod, same Host header, one hop apart**:

```
through the tunnel (cloudflared sends X-Forwarded-Proto: https)
  "callbackUrl":"https://k3d-hackagon.example.org/auth/callback/keycloak"
loopback to the same ingress, no X-Forwarded-Proto
  "callbackUrl":"http://k3d-hackagon.example.org:8090/auth/callback/keycloak"
```

With `protocolHeader` removed the second line becomes `https://…:8090` — the
guess, on an origin nothing serves. That is the original bug, reproduced.

### Teardown, and what it refuses to leave behind

- `tunnel.sh down` — stops cloudflared, reinstalls the `*.localhost` values,
  puts the Keycloak client's redirect URIs back, deletes `.state/mode.env`, and
  **prints both hostnames and the give-up command**.
- `tunnel.sh destroy` — the above plus the tunnel, its credentials file and both
  CNAMEs.
- `down.sh` **stops the tunnel BEFORE deleting the cluster**, always. The order
  matters: in between, the public URL is a 502 from a healthy-looking tunnel,
  which is the least informative failure available. It leaves the DNS records
  (they are cheap, they make the next `up` a no-op, and deleting records in a
  shared zone is not a thing a routine teardown should do quietly) — with the
  tunnel stopped they answer Cloudflare's 1033, "tunnel not found", which is
  true. `down.sh --purge` destroys them.
- Nothing tracked ever carries the hostname: the overlay is generated into
  gitignored `.state/`, and the names live in the same gitignored
  `.claude/skills/cloudflare-tunnel/.env` the other three rigs read.

`tunnel.sh up` is idempotent — the second run reuses the tunnel and reports
`DNS ok` for both records rather than rewriting them.

### Two traps this mode has, both about DNS and neither about the tunnel

**A probe run BEFORE the record exists poisons the local resolver for the zone's
negative TTL** — 1800 s on `example.org`. `tunnel.sh status` asks, so the very
first status call on a name you are about to create costs you half an hour of
`NXDOMAIN` on that machine while the record serves perfectly everywhere else.
`lib.sh` answers it by asking Cloudflare over DoH and pinning `--resolve` for
curl; SNI and the certificate check are untouched, so the pin chooses an edge and
nothing more.

**The devcontainer's network answers AAAA-only with no IPv6 route out** (the same
fault `.claude/CLAUDE.md` records for the dev tunnels): `getent hosts` returns
two v6 addresses, none reachable, and Firefox fails in 3 ms with
`NS_ERROR_UNKNOWN_HOST`. `browser-check.sh` pins `/etc/hosts` inside the
container from a DoH-resolved A record and removes it again on exit.
Measured on the way: `network.dns.disableIPv6` **is not enough on its own** —
it stops the browser preferring v6, and here there is no A record to fall back
to, so the failure is identical.

## What it found

Six things, all in `helm-chart/`, all fixed here, none of which the rendered
manifest showed.

1. **`templates/keycloak-ingress.yaml` hard-coded `ingressClassName:
   webapprouting.kubernetes.azure.com`**, the cert-manager issuer and a TLS
   block. `frontend.ingress.ingressClass` has always existed; this object
   ignored it, so on any cluster that is not the AKS app-routing addon the
   Ingress was claimed by no controller — a deployment that serves the product
   and not its login. `keycloak.ingress.enabled` was decoration too: the object
   rendered whatever it said, and values.yaml said `false`.
2. **`backend.config.server.adminkeycloakid` shipped empty and is required at
   boot.** `internal/config/config.go` refuses the whole configuration with
   "server.adminkeycloakid is required", so `helm install` of the chart's own
   defaults succeeds and the backend then sits in CrashLoopBackOff with the
   reason only in a pod log. It is `required` at render time now.
3. **The OIDC callback 502'd through the chart's own Ingress.** The session JWT
   carries the Keycloak access and refresh tokens, so `Set-Cookie` on
   `/auth/callback/keycloak` is chunked and multi-kilobyte; nginx's default 4k
   `proxy_buffer_size` refuses it rather than truncating. It presents as well as
   a bug can hide: Keycloak had authenticated, the code had been exchanged, and
   the frontend logged "JWT Callback: Initial sign-in successful" with the right
   user id. Only the browser sees the 502, only on the last redirect.
   `frontend.ingress.proxyBufferSize` (16k) is now written as an annotation.
   Applies to the AKS addon too — it is ingress-nginx with the same default.
4. **The frontend advertised an origin that did not exist** (see above);
   `frontend.protocolHeader` (`x-forwarded-proto`) and a `frontend.extraEnv`
   escape hatch were added.
5. **values.yaml named the ExternalName kill switch wrongly.** It said
   `disable-service-external-name` "in the controller ConfigMap". Setting that
   key changes nothing — no warning, same upstream in the access log. The real
   switch is the controller's command-line flag `--disable-svc-external-name`,
   and with it the route does answer 503 exactly as the comment predicted. A
   cluster believed to have blocked ExternalName that way has not.

6. **Keycloak's hostname was hard-coded one label deeper than the app's.**
   `frontend.ingress.hosts[].host` has always been free-form; `hackagon.keycloakHost`
   was `auth.{baseDomain}` with no override, so putting the app at
   `k3d-sdsc-hackathons.example.org` forced Keycloak to
   `auth.k3d-sdsc-hackathons.example.org`. **A one-label wildcard certificate
   covers the first and not the second** — and Cloudflare's free Universal SSL is
   exactly such a certificate, answering the deeper name with TLS alert 40. So a
   deployment fronted that way publishes the product on a certificate that does
   not cover its login: the same shape as finding 1, from a different cause.
   `keycloak.ingress.host` now overrides it, defaulting to the old derivation, so
   no existing deployment changes. **This is the only chart change real HTTPS
   needed** — everything else about the https mode is configuration.

Three more are recorded but deliberately **not** fixed — one is an arguable
design call and two are cosmetic:

- **The backend hard-exits at boot if Keycloak's JWKS endpoint is not yet
  answering.** On a fresh install Keycloak takes ~90 s (image pull plus schema
  migration) and the backend crash-loops until then — 3 restarts on the run
  that produced these numbers. It self-heals, so nothing is broken; the cost is
  diagnostic. An operator watching `helm install` sees a backend in
  CrashLoopBackOff and cannot tell this apart from finding 2, which looks
  identical and never recovers. Either retry the JWKS fetch at startup, or give
  the Deployment an init container that waits on Keycloak.

- The frontend's `livenessProbe` is `GET /`, which renders the home page, which
  calls the backend. A backend outage therefore restarts every frontend pod for
  as long as it lasts — and liveness restarts cannot fix an upstream. It also
  masked finding 2: the frontend crash-looped alongside the backend and looked
  like the same fault. Readiness on `/` is right; liveness probably wants a
  route that does not fan out.
- `keycloak.database.external.database` / `.user` in values.yaml are read by the
  subchart as `name` / `username`. The two ignored keys happen to carry the same
  strings as the subchart's defaults, so it works by coincidence.
  `keycloak.persistence` is ignored outright — the subchart has no such value.

- **`hackagon.frontendHost` — the host the realm ConfigMap rewrites the client's
  redirect URIs to — is `app.{baseDomain}` and ignores
  `frontend.ingress.hosts[].host` entirely.** Set the app's host to anything
  else and the realm is imported allowing redirects to a hostname that does not
  exist; Keycloak then answers the login with `Invalid parameter: redirect_uri`,
  which names the parameter and not the mistake. Found while wiring the https
  mode, and NOT fixed here because this rig cannot observe the failure — `up.sh`
  rewrites the realm itself before handing it to the chart, so the chart's own
  replaces are already no-ops, and `tunnel.sh` sets the URIs on the running
  Keycloak (a realm imports ONCE, so an upgrade could not change them anyway).
  Same family as finding 6: one host value free-form, its partner derived.

## What the checks actually check

`verify.sh` never asserts "the pods are Running". Every negative assertion has a
positive control, because this repository has a written record of suites staying
green while testing nothing.

**Claim 1 — a presigned PUT survives the Host rewrite.** Three legs: the signed
URL is accepted through the chart's `/objects` route (200); the SAME signature
is refused with `SignatureDoesNotMatch` through an Ingress identical but for the
missing `upstream-vhost`; and accepted again through the chart's route, so the
refusal is about the annotation and not a stale URL. The control is applied from
`manifests/control-no-vhost-ingress.yaml` and `verify.sh` asserts the two
annotation sets differ by exactly that one key — a control that has drifted is
not a control. The bucket policy is checked both ways too, and the "private
prefix 403s" check is backed by a presigned GET proving the object is there.

The signing is `scripts/presign.sh`, a mirror of
`components/backend/internal/storage/sigv4.go`. It exists because the published
images (`ghcr.io/…/backend-service:latest`) **predate the object-storage work on
this branch** — the binary contains no `internal/storage` package and no
`CreateUploadUrl`, so there is no deployed handler to ask. That also makes it
the more honest test of the claim, which is about what the ingress does to a
signed request.

**Claim 2 — the regex path beats `/`.** Both Ingresses claim the same host; `/`
returns the SvelteKit document; `/objects/<bucket>/<key>` returns the object's
bytes; and `/objectsnotaprefix` does NOT reach the store — the `(/|$)` boundary
is what stops the prefix swallowing application routes.

**Claim 3 — ingress-nginx accepts an ExternalName upstream.** The chart's
Service is ExternalName, pointing at the endpoint host, and is the `/objects`
backend; traffic through it is served rather than 503'd. Then the flag is turned
ON, the route is watched to 503, and turned off again — otherwise "200" is
equally consistent with the kill switch not existing, which is what the first
attempt at this check accidentally demonstrated.

**Login round-trip.** Discovery names the public issuer; the frontend advertises
the origin it is actually reached on; sign-in redirects to Keycloak; the realm's
username-first flow is driven in two POSTs; Keycloak redirects back with a code;
**the callback returns 302 and not 502**; and `/auth/session` carries alice's
email and a Keycloak access token.

**Optional blocks absent.** Read out of the LIVE container — not `helm
template`, not the ConfigMap. The frontend image is distroless (no shell, no
tar), so `kubectl exec` and `kubectl cp` are both out; an ephemeral debug
container with `--profile=sysadmin` reads the real mount through `/proc/1/root`.
The positive control runs FIRST, and it earned its place: with the default debug
profile the read returns "Permission denied" even though both containers run as
uid 0, and both absence assertions passed against that error message.

## ⚠ It imports the development realm

`up.sh` imports `tools/configs/keycloak/realm-hackagon.json` — the development
export: **alice, bob, charles and hackagon-admin, all with the password
`aliceandbob`**, all with `emailVerified` and no password policy. It is imported
because the login round-trip has to sign somebody in, and inventing a second
realm would test a realm nobody deploys. `--no-realm` skips it.

### ⚠⚠ …and `tunnel.sh up` PUBLISHES that realm to the internet

Everything above is written on the assumption that the rig binds loopback only.
**`scripts/tunnel.sh up` is the one thing here that breaks it**, and the
consequence deserves saying plainly: while the tunnel is up, anyone who learns
the hostname can sign in as **alice, bob, charles or hackagon-admin with the
password `aliceandbob`** — the last of those being a global Admin. There is no
authentication in front of the tunnel; a Cloudflare quick-tunnel-style obscure
name is not one either, and these names are guessable by design.

Treat a tunnelled cluster as a demo you are watching, not as something to leave
running. `tunnel.sh down` is one command and `down.sh` stops the tunnel before it
deletes anything. If it must live longer than a session, put Cloudflare Access in
front of the hostnames or import a realm that is not the development export
(`up.sh --no-realm`, then create the accounts you actually want).

That is why this rig is opt-in and why it binds loopback only. Nothing it
generates may be copied anywhere: `helm-chart/values.k3d.yaml` is tracked and
contains **no credential of any kind** — the postgres, keycloak-db, OIDC-client
and object-store secrets are minted per cluster into a gitignored
`.state/secrets.env`, and the storage credentials reach the chart as a Secret
`up.sh` creates with `kubectl`, because the chart refuses to read them from
values at all.

`values.k3d.yaml` does carry one line that must never travel:
`NODE_TLS_REJECT_UNAUTHORIZED=0` on the frontend, so it will accept the
self-signed Keycloak certificate. The honest alternative needs an `extraVolumes`
hook and `NODE_EXTRA_CA_CERTS`; inventing chart surface to make a test pass is
how test-only surface gets into a production chart.

## Toolchain

`helm` and `k3d` are not on this Windows host and `scripts/tools.sh` fetches
pinned binaries into the gitignored `bin/` (k3d 25 MB, helm 18 MB, kubectl 3 MB).
Containerised alternatives were considered and rejected: `k3d` in a container
needs the Docker socket bind-mounted AND a shared path for the kubeconfig, and
on Docker Desktop for Windows the socket has to be spelled `//var/run/docker.sock`
to survive MSYS mangling; `alpine/helm` has to reach an apiserver published on
the HOST's loopback, which is not the container's, so it needs
`--network k3d-<cluster>` and a rewritten server URL. If a machine may not fetch
binaries, both are still possible — that is the shape they need.

**Two Windows traps, both handled in `lib.sh`.** Paths are converted with
`cygpath -m` (`C:/Users/…`), never `cygpath -w`: helm's `--set-file` value goes
through its strvals parser, which treats `\` as an escape, so a Windows path
arrives as `C:UsersKato…` and helm reports the file missing. And every wrapper
sets `MSYS_NO_PATHCONV=1`, because MSYS rewrites arguments that only LOOK like
paths — a JSON patch's `"/spec/template/…"`, `sh -c 'cat /proc/1/root/…'`.
