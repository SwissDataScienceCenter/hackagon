# Deploying on Kubernetes — the Helm chart, and the rig that proved it

`helm-chart/` installs the whole platform: frontend, backend, Keycloak and
Postgres, with two Ingresses and a third for uploads. It renders, it lints, and
until 2026-08-14 **nothing had ever installed it** — which is how five bugs
survived in a chart that looked fine in every diff.

This page has two halves and they are for different people.

| If you are…                                    | Read                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| **deploying this for real**                    | [Part 1](#part-1--deploying-it) — what you supply, what will bite you, what the chart deliberately does not do |
| **testing or changing the chart**              | [Part 2](#part-2--testing-the-chart-locally) — the k3d rig, its two modes, and what each can and cannot prove |

Every hostname below is `example.org`. Nothing tracked in this repository names
a real zone, and that is a rule rather than a habit: a tunnel hostname once sat
committed in a tracked config and outlived the tunnel it named.

---

## Part 1 — deploying it

### What the chart deploys, and what it does not

Deployed: `frontend` (SvelteKit, adapter-node) and `backend` (Go, gRPC) as
Deployments with a Service each; Keycloak and Postgres as subchart dependencies
(`repo.helmforge.dev` 3.x and Bitnami 18.x, vendored in `helm-chart/charts/`);
an Ingress for the app, one for Keycloak, and one for `/objects`.

**Not deployed, on purpose:**

- **The object store.** A bucket is the one piece of state here that must
  outlive the release, and a StatefulSet inside an application chart invites
  `helm uninstall` to take the uploads with it. You point the chart at S3, Ceph
  RGW, MinIO — whatever the platform already runs and already backs up.
- **The bucket policy.** See [the object store](#the-object-store-is-yours-and-so-is-its-policy);
  a store without it answers 403 to every image.
- **Certificates.** The chart writes `cert-manager.io/cluster-issuer:
  letsencrypt-production` as a default annotation and names TLS secrets; it
  installs no issuer and mints nothing.
- **Anything below the pod.** There is no ServiceAccount, PodSecurityContext,
  NetworkPolicy, PodDisruptionBudget, HPA, `nodeSelector`, `tolerations`,
  `affinity` or `imagePullSecrets` in any template — verified by grep across
  `helm-chart/templates/`. The images are public on GHCR, so the last one has
  not been needed yet.
- **A backend Ingress.** gRPC is cluster-internal; the SvelteKit server is the
  only client. That is deliberate — see
  [frontend/grpc-clients.md](frontend/grpc-clients.md).

### What you must supply

The chart refuses to render without these. The list is not from reading
`values.yaml` — it is what `helm template` demanded, one failure at a time,
until it rendered (25 objects, `helm lint` clean):

| Value                                     | Why it is required                                            |
| ----------------------------------------- | ------------------------------------------------------------- |
| `backend.config.server.adminkeycloakid`   | the Keycloak `sub` of the platform admin; the backend refuses to boot without it |
| `backend.config.database.postgresPassword`| the app's Postgres user                                        |
| `frontendSecrets.clientSecret`            | the OIDC client secret for `hackagon-frontend`                 |
| `frontendSecrets.authSecret`              | Auth.js session signing key                                    |
| `keycloak.hostname.hostname`              | full URL with scheme; Keycloak 26 in production mode           |
| `keycloak.database.external.host`         | e.g. `hackagon-postgresql`                                     |
| `keycloak.database.external.password`     | Keycloak's own Postgres user                                   |
| `storage.endpoint`                        | when `storage.enabled` (the default)                           |
| `storage.bucket`                          | "                                                              |
| `storage.existingSecret`                  | " — the chart **refuses** to read storage credentials from values |

`baseDomain` has a default (`example.com`) that is wrong everywhere, and
`postgresql.auth.postgresPassword` is *not* render-required — left empty, the
Bitnami subchart looks the existing Secret up and, failing that,
`randAlphaNum 24`s one. That lookup is what makes `helm upgrade` against a live
cluster safe, and it is exactly what a rendered pipeline does not have: `helm
template` piped to `kubectl apply`, or any GitOps flow that renders without
cluster access, mints a *new* password on every render while the database keeps
the old one. Set it explicitly.

A minimal file, then:

```bash
helm lint ./helm-chart -f my-values.yaml
helm template hackagon ./helm-chart -f my-values.yaml | less
```

Both were run while writing this. Read the render before installing: every
template in this chart carries its reasoning in comments, and the rendered
output is where you find out that `frontend.ingress.ingressClass` still defaults
to `webapprouting.kubernetes.azure.com` — the AKS app-routing addon.

Storage credentials come from a Secret you create out of band:

```bash
kubectl -n hackagon create secret generic hackagon-storage \
  --from-literal=accessKey=… --from-literal=secretKey=…
```

⚠ **The backend's env loader splits any value containing a SPACE into a list.**
An access key with a space in it will not arrive intact.

Then:

```bash
helm upgrade --install hackagon ./helm-chart \
  --namespace hackagon --create-namespace \
  -f my-values.yaml --timeout 15m
```

**The release must be called `hackagon`.** `values.yaml` sets
`keycloak.realmImport.existingConfigMap: hackagon-realm`, while the ConfigMap the
chart creates is `<fullname>-realm`. Rendered as release `hackapp`, the chart
creates `hackapp-hackagon-realm` and Keycloak mounts `hackagon-realm` — a
ConfigMap that does not exist. `hackagon-keycloak-init` (the Postgres initdb
script) is hard-coded on both sides, so it survives a rename but collides
between two releases in one namespace.

### The object store is yours, and so is its policy

Uploads go **from the browser straight to the store** over a presigned URL; the
bytes never pass through the app. The design is
[storage.md](storage.md) — read it before wiring a bucket, not after.

What the chart needs from you: a bucket, an endpoint, credentials in a Secret,
and **a per-prefix policy**:

| Prefix          | Access      | Holds                                        |
| --------------- | ----------- | -------------------------------------------- |
| `hackathons/*`  | public-read | event logos, gallery photos                  |
| `users/*`       | public-read | avatars                                      |
| `site/*`        | public-read | platform-page imagery                        |
| everything else | **private** | `teams/*` submissions above all, and exports |

**A store without that policy answers 403 to every image.** The upload succeeds,
the backend hands back a `publicUrl` it has no way to know is unreadable, and
the row in the database is correct — so the failure looks like a broken frontend.
It has happened once already, when `SITE_MEDIA` was added to the upload rules
and not to the policy.

`.devcontainer/rustfs-init.sh` is the reference: it carries the exact policy
document (`put_public_policy`) and a `--selftest` that proves both halves —
public prefixes readable with no credentials, private ones refused, with a
presigned GET as the positive control so the 403 is a refusal and not a miss. It
resolves its endpoint and credentials from `RUSTFS_ENDPOINT`,
`HACKAGON_RUSTFS_ACCESS_KEY`, `HACKAGON_RUSTFS_SECRET_KEY` and
`HACKAGON_RUSTFS_BUCKET`, so it can be pointed at a real bucket — *not run
against one while writing this*, only against the k3d rig's store.

`storage.enabled: false` is honest rather than absent: the chart writes an
**empty** endpoint into the backend config so the storage RPCs answer
`Unavailable`. Omitting the key would leave the backend on its development
default (`http://rustfs:9000`, with the committed dev keys).

### The `/objects` Host rewrite — the failure nobody diagnoses

SigV4 signs the `Host` header. The backend signs the **store's** hostname,
because that is the only name it knows. A reverse proxy passes the **incoming**
host through by default, the store recomputes a different signature, and every
presigned PUT answers `403 SignatureDoesNotMatch`.

**Public reads are unsigned and keep working.** That asymmetry is why it hid for
days at the tunnel edge: every page renders, every image loads, and only people
uploading find out.

The chart writes the fix for you, on a **separate** Ingress (`<release>-objects`)
because `upstream-vhost` and `rewrite-target` are per-Ingress annotations and
applying them to the app's own rules would rewrite every application URL:

```
nginx.ingress.kubernetes.io/upstream-vhost: <store host[:port]>
nginx.ingress.kubernetes.io/rewrite-target: /$2
nginx.ingress.kubernetes.io/use-regex:      "true"
nginx.ingress.kubernetes.io/proxy-body-size: 64m
nginx.ingress.kubernetes.io/backend-protocol: HTTP|HTTPS
```

**The observed negative control**, run against the k3d rig on 2026-08-14 —
same store, same presigned URL, one annotation apart:

| Route                                                    | Result                        |
| -------------------------------------------------------- | ----------------------------- |
| the chart's `/objects` Ingress                            | `200`                         |
| an Ingress identical **but for `upstream-vhost`**          | `SignatureDoesNotMatch`       |
| the chart's route again, **same signature**                | `200`                         |
| public prefix, no credentials                              | `200`                         |
| `teams/` (private)                                         | `403`                         |
| `/objectsnotaprefix`                                       | `303` — the app, not the store |

The third row is what makes the second mean anything: without it, the refusal is
equally consistent with the URL having gone stale. The last row is the `(/|$)`
boundary in the path regex doing its job — the prefix must not swallow
application routes.

**This is ingress-nginx only.** The AKS app-routing addon is ingress-nginx, so
it works there. Traefik cannot express a Host rewrite in a core Ingress object
at all — it needs `passHostHeader: false` plus a `Headers` middleware CRD. On
Traefik, set `storage.objects.ingress.enabled: false` and let the frontend proxy
`/objects` instead: the app owns that path as a fallback
(`src/routes/objects/[...path]/+server.ts`) and re-issues the request to
`STORAGE_ENDPOINT`, so `fetch` sets Host from that URL and the signature still
matches. It works — it just puts every uploaded byte through the app server,
which is what presigned URLs exist to avoid.

`64m` is not arbitrary: the largest rule the backend signs is a 50 MiB
submission attachment (`internal/service/storage_service.go`), and nginx
defaults to `1m`, which would 413 almost every image.

Left empty, `storage.objects.ingress.service.name` makes the chart render an
**ExternalName** Service for the endpoint's hostname — that is what makes an
out-of-cluster store routable from an Ingress. ingress-nginx can be told to
refuse those, and the switch is the controller's **command-line flag**
`--disable-svc-external-name`, not a ConfigMap key. On a cluster that sets it,
name an in-cluster Service here or disable the route.

### The scheme has to be observed, not guessed

adapter-node does not know what scheme the browser used. With neither `ORIGIN`
nor `PROTOCOL_HEADER` set, **its inference is the literal string `https`**, and
everything is built from that guess: the URLs `/auth/providers` advertises, the
target of the sign-in form, SvelteKit's CSRF comparison, and whether Auth.js
puts the `__Secure-` prefix on its session cookie.

`frontend.protocolHeader` (default `x-forwarded-proto`) makes it observed.
Measured on the rig on 2026-08-14, app reached over plain http:

```console
$ curl -s http://app.hackagon.localhost:8090/auth/providers
{"keycloak":{…,"callbackUrl":"http://app.hackagon.localhost:8090/auth/callback/keycloak"}}

$ kubectl -n hackagon get deploy hackagon-frontend -o jsonpath=\
'{.spec.template.spec.containers[0].env[?(@.name=="PROTOCOL_HEADER")].value}'
x-forwarded-proto
```

Without it, that line reads `https://…` on an origin nothing serves: the sign-in
form POSTs nowhere, the CSRF cookie is issued `Secure` over http and never
stored, and **every page still returns 200**.

⚠ **The header has to be TRUE, which is a property of your ingress, not of this
chart.** ingress-nginx sends `X-Forwarded-Proto: $pass_access_scheme`, which
defaults to the scheme of the connection *it* accepted. If TLS terminates in
front of the controller (a cloud LB, a CDN, a tunnel), the controller sees http
and will happily tell the app so. The controller then needs
`use-forwarded-headers: "true"` — and, as the rig's own
`manifests/ingress-nginx-values.yaml` warns in the same breath, that means any
client able to reach the controller directly can claim to be on https, so pair
it with `proxy-real-ip-cidr` scoped to the proxies you actually have.

Keep `frontend.config.cookies.useSecure` in step with the real scheme.

### A config-only upgrade used to change nothing at all

Fixed 2026-08-14. It is written up rather than deleted because **the symptom was
that there was no symptom**: `helm upgrade` reported success, `kubectl get
configmap` showed the new value, and every running pod went on serving the old
one. Rotating the OIDC client secret that way changed nothing that was running.

Two things combined, and either alone would have been survivable:

1. **`subPath` mounts never receive updates.** Three of them — the backend's
   `config.yaml`, the frontend's `config.yaml` and its `secrets.yaml`. The
   kubelet refreshes a plain ConfigMap volume; a `subPath` mount is resolved
   once, at container start. That is Kubernetes behaviour, not a chart bug.
2. **No template carried a `checksum/config` annotation.** So after a
   config-only upgrade the Deployment's pod template was byte-identical, and
   Kubernetes correctly did nothing.

Measured on the k3d rig before the fix, changing one frontend config value:
`helm upgrade` returned in **0.9 s** with status `deployed`, the ConfigMap held
the new value, and the frontend pod — **same pod name, same
`metadata.generation`** — still served the old one. It was never restarted,
because nothing asked it to be.

The fix is the standard idiom: a pod-template annotation whose value is a hash
of the rendered config, so changing the config changes the pod template and the
Deployment rolls itself.

```yaml
checksum/config: {{ include (print $.Template.BasePath "/backend-configmap.yaml") . | sha256sum }}
```

Three of them: `checksum/config` on the backend, and `checksum/config` +
`checksum/secret` on the frontend. After the fix, the same experiment leaves the
running pod holding the new value with nobody restarting anything.

⚠ **Hashing rendered output is only safe while the render is deterministic.**
One non-deterministic byte in a hashed template and every upgrade rolls every
pod forever — a worse bug wearing this one's clothes. This chart has a real
source of such bytes: the Bitnami and Keycloak subcharts mint passwords during
rendering, and `helm template` run twice produces two different Keycloak
`admin-password`s (and two different `postgres-password`s whenever
`postgresql.auth.postgresPassword` is left empty). **None of it reaches the
hashed templates** — verified by rendering twice, in that exact state, and
finding all three checksums byte-identical while the subchart Secrets differed.
The structural reason is that the DB password these ConfigMaps write comes from
`backend.config.database.postgresPassword`, which is `required`, so it can only
come from values. `verify.sh` now asserts it on every run.

**What it does not cover, and what the annotation costs:**

- **Editing a ConfigMap or Secret directly** — `kubectl edit`, or any
  controller writing to it — still does not reach a running pod. The `subPath`
  mount is unchanged; only a pod-template change rolls it, and Helm is what
  produces one. Outside Helm, `kubectl rollout restart` remains the answer.
- **Keycloak and Postgres are the subcharts' business.** The Keycloak subchart
  already carries its own `checksum/secrets`; nothing here changed for either.
- **`checksum/secret` puts a hash of secret material into the pod spec**, which
  anyone with `get deployment` can read while the Secret itself needs `get
  secret`. A sha256 is not the secret, but it *is* an oracle: someone who
  guesses `frontendSecrets.clientSecret` can confirm the guess without asking
  Keycloak. Kept anyway, because every alternative is worse — any value that
  changes when the secret changes is the same oracle, and a value that does not
  change is the original bug. What bounds it is entropy: keep `clientSecret` and
  `authSecret` long and random, which they must be regardless.

### `keycloakHost` and the certificate that does not cover it

`hackagon.keycloakHost` derives `auth.{baseDomain}`, and
`frontend.ingress.hosts[].host` has always been free-form. So the moment the app
is *not* at `app.{baseDomain}`, the two part company — and if `baseDomain` is
the app's own one-label name, Keycloak lands **one label deeper**.

That matters because **Cloudflare's free Universal SSL covers the apex plus one
label and nothing below it**. Measured against the edge before any record was
created (`e0d2f6d2`): a two-label name answers the TLS handshake with alert 40,
`handshake_failure`; a one-label sibling gets the zone's real certificate. A
browser reads that as a broken site, not as a missing certificate — so the
deployment publishes the product on a certificate that does not cover its login.

`keycloak.ingress.host` overrides it (with the same `{baseDomain}` /
`{releaseName}` substitution as every other host value), defaulting to the old
derivation so no existing deployment changes.

⚠ **The Keycloak hostname appears in five values and none derives from another.**
Change it and change all of them:

```yaml
keycloak:
  hostname: { hostname: "https://auth-app.example.org" }   # subchart, full URL
  ingress:  { host: "auth-app.example.org" }               # the Ingress rule + TLS
frontend:
  config: { oidc: { issuer: "https://auth-app.example.org/realms/hackagon" } }
backend:
  config:
    oidc:
      issuerurl: "https://auth-app.example.org/realms/hackagon"
      jwksurl: "https://auth-app.example.org/realms/hackagon/protocol/openid-connect/certs"
```

`issuerurl` is a **string compared** against the `iss` claim, so it must be the
public URL. `jwksurl` is a URL the backend **fetches**, so it may take the short
in-cluster path — the rig does exactly that.

### Five bugs a real install found

Each is fixed in the chart. They are here because **the symptom is how you
recognise the next one**, and none of them showed up in a rendered manifest.

1. **The product serves; login does not.** `keycloak-ingress.yaml` hard-coded
   `ingressClassName: webapprouting.kubernetes.azure.com`. On any cluster that
   is not the AKS app-routing addon, no controller claimed that Ingress: the app
   answered and `auth.<baseDomain>` answered nothing at all.
   `keycloak.ingress.enabled` was decoration too — the object rendered whatever
   it said, and `values.yaml` said `false`.

2. **Install succeeds, backend crash-loops, reason only in a pod log.**
   `backend.config.server.adminkeycloakid` shipped empty and
   `internal/config/config.go` refuses the whole configuration without it. The
   chart is `required` at render time now — ten seconds instead of ten minutes.

3. **The OIDC callback 502s, after login has already succeeded.** The session
   JWT carries Keycloak's access and refresh tokens, so `Set-Cookie` on
   `/auth/callback/keycloak` is chunked and multi-kilobyte, and nginx's 4k
   `proxy_buffer_size` refuses it rather than truncating. Keycloak had
   authenticated, the code had been exchanged, and the frontend logged
   `JWT Callback: Initial sign-in successful` with the right user id. Only the
   browser sees the 502, and only on the last redirect.
   `frontend.ingress.proxyBufferSize: "16k"` is written as an annotation now.
   **This hits the AKS addon too** — same controller, same default.

4. **The frontend advertised an origin that does not exist.** adapter-node's
   guess; see [above](#the-scheme-has-to-be-observed-not-guessed).

5. **A kill switch documented in the wrong place.** `values.yaml` named the
   ExternalName switch as `disable-service-external-name` "in the controller
   ConfigMap". Setting that key changes nothing — no warning, same upstream in
   the access log. The real switch is the flag `--disable-svc-external-name`. A
   cluster believed to have blocked ExternalName that way has not.

### Known broken, recorded rather than fixed

- **`hackagon.frontendHost` ignores `frontend.ingress.hosts` entirely.** It is
  `app.{baseDomain}`, full stop, and it is what the realm ConfigMap rewrites the
  OIDC client's redirect URIs to. Rendered with the app at
  `hackathons.example.org`, the realm still says
  `https://app.example.org/*` — a hostname that does not exist — and Keycloak
  answers the login with `Invalid parameter: redirect_uri`, which names the
  parameter and not the mistake. **If your app is not at `app.{baseDomain}`,
  fix the redirect URIs on the running Keycloak; a realm imports once, so an
  upgrade cannot change them anyway.**

- **`NOTES.txt` prints the wrong URL on every install.** `Frontend:
  https://{{ .Values.baseDomain }}` — not `app.{baseDomain}`, not
  `frontend.ingress.hosts` — and the Keycloak line ignores
  `keycloak.ingress.host`. Verified with `helm install --dry-run`. Same family
  as the item above.

- **The backend hard-exits on any dependency that is not up yet.** Postgres
  refusing connections (`create schema`) and Keycloak's JWKS endpoint not
  answering (`create server`) both reach `logx.Fatal` in
  `cmd/service/main.go`. On a fresh install Keycloak takes ~90 s (image pull
  plus schema migration) and the backend crash-loops until then. It self-heals —
  the rig's own cluster shows `RESTARTS 3`, the last termination being
  `dial tcp …:5432: connect: connection refused`, exit 1 — so nothing is broken.
  **The cost is diagnostic: this is indistinguishable from bug 2, which looks
  identical and never recovers.** Either retry at startup or give the Deployment
  an init container that waits.

- **`livenessProbe` on the frontend is `GET /`, which renders the landing page.**
  Both of that page's backend calls are caught today
  (`(public)/+page.server.ts` carries `listUnavailable` precisely so an outage
  and an empty platform stop looking alike), so a backend outage no longer
  fails the probe — but it still costs up to five gRPC calls per pod every 15 s
  to answer "is this process alive", and liveness and readiness use the same
  path, so neither distinguishes wedged from degraded. Liveness wants a route
  that does not fan out.

- **`postgresPassword` renders into a ConfigMap in plaintext.** Two of them:
  `<release>-backend-config` (the app DB password, inside `config.yaml`) and
  `hackagon-keycloak-init` (both DB passwords, inside the initdb SQL). A
  ConfigMap is readable by anything with `get` on the namespace. The storage
  credentials are handled correctly — Secret only, and the chart refuses to
  read them from values at all — so the pattern exists; the DB passwords have
  not been moved to it.

- **`keycloak.database.external.database` / `.user` are ignored** by the
  subchart, which reads `name` / `username`. They happen to carry the same
  strings as the subchart's defaults, so it works by coincidence.
  `keycloak.persistence` is ignored outright — the subchart has no such value.

- **`--set-file realmJson=./tools/configs/keycloak/realm-hackagon.json` imports
  the development accounts.** That export carries alice, bob, charles and
  hackagon-admin with real password credential hashes, `emailVerified` true and
  no password policy. It is the right file for a test cluster and the wrong file
  for anything reachable. Omit `realmJson` and configure the realm yourself, or
  export one that has no users in it.

- **Three helpers in `_helpers.tpl` are defined and never used**:
  `hackagon.serviceAccountName`, `hackagon.randAlphaNum`, `hackagon.getPassword`.
  The first would nil-pointer if anything called it — there is no
  `serviceAccount` key in `values.yaml`.

### What has never been tested on a cluster

Written down in `b98fbdda` rather than left to be discovered: real TLS and
cert-manager, virtual-hosted-style storage (`usePathStyle: false`), storage
disabled, the frontend-proxy `/objects` fallback, more than one replica of
anything, PVC-backed Postgres, and Traefik. Real edge-terminated TLS has since
been covered by the rig's tunnel mode (below); the rest has not.

---

## Part 2 — testing the chart locally

`.claude/skills/k3d-chart-rig/` installs the chart on a throwaway k3d cluster
and then makes the arguable claims observable. Its `SKILL.md` is the reference —
what follows is why it is shaped the way it is.

```bash
bash .claude/skills/k3d-chart-rig/scripts/up.sh       # ~4 min cold, ~90 s warm
bash .claude/skills/k3d-chart-rig/scripts/verify.sh   # 55 checks, ~4 min
bash .claude/skills/k3d-chart-rig/scripts/install.sh --restart   # iterate on the chart
bash .claude/skills/k3d-chart-rig/scripts/down.sh     # delete the cluster
```

Three decisions carry the rig. **Traefik is disabled and ingress-nginx installed
in its place** — with the bundled controller the one thing this exists to test
cannot work. **The controller listens on 8090 in-cluster as well as on the
host**, because the OIDC issuer is one string that both the browser and the
frontend pod must reach, and Auth.js rejects a discovery document whose `issuer`
differs from the configured one. And **`*.localhost`, not nip.io** — whether a
wildcard-DNS service resolves is a property of whoever runs DNS for the
developer, and the resolver on the machine this was written on applies
DNS-rebinding protection and refuses.

It runs from the **host**, not the devcontainer: `.devcontainer/` mounts no
Docker socket and the image has no `docker` CLI. `verify.sh` never asserts "the
pods are Running" — that was true throughout the run where login was dead.

### Mode 1 — `*.localhost`, app on http, Keycloak on https

The asymmetry is the point, in both directions.

**Keycloak needs TLS.** Its `AUTH_SESSION_ID` / `KC_RESTART` cookies are in the
federation scope, which is `SameSite=None`, which forces `Secure` — whatever
scheme it is reached over. Over plain http, curl discards them per the cookie
spec and the login POST comes back 400 "session expired". No chart change could
fix that; `up.sh` mints a 90-day self-signed certificate into the Secret name
the chart already defaults to.

**The app stays on http, and that half is load-bearing.** An https-everywhere
rig agrees with adapter-node's `https` guess by accident and proves nothing. On
http, a frontend that guesses wrong advertises https callbacks, issues
`__Secure-` cookies the browser will not send back, and login dies with every
page still answering 200. That is bug 4, and this mode is where it was found.

**What it cannot prove:** anything about a real certificate chain, and anything
about `__Secure-` — because that prefix is a rule about the **user agent**, and
curl implements no such rule. A green curl login is equally consistent with the
prefix working and with it being ignored.

### Mode 2 — the same cluster on a real public hostname

```bash
bash .claude/skills/k3d-chart-rig/scripts/tunnel.sh up
bash .claude/skills/k3d-chart-rig/scripts/verify.sh        # the same 55, over https
bash .claude/skills/k3d-chart-rig/scripts/browser-check.sh # 13 checks a browser must answer
bash .claude/skills/k3d-chart-rig/scripts/tunnel.sh down
bash .claude/skills/k3d-chart-rig/scripts/tunnel.sh destroy
```

> ### ⚠ This publishes the development realm to the internet
>
> While the tunnel is up, **anyone who learns the hostname can sign in as
> alice, bob, charles or hackagon-admin with the password `aliceandbob`** — the
> last of those being a global Admin. There is no authentication in front of the
> tunnel, and an obscure hostname is not one; these names are guessable by
> design.
>
> Treat a tunnelled cluster as a demo you are watching, not as something to
> leave running. `tunnel.sh down` is one command, and `down.sh` stops the tunnel
> **before** deleting the cluster — in between, the public URL is a 502 from a
> healthy-looking tunnel, which is the least informative failure available. If
> it must outlive a session, put Cloudflare Access in front of it or run
> `up.sh --no-realm` and create the accounts you actually want.

TLS terminates at the Cloudflare edge and the origin stays plain http. That is
not a shortcut — it is the shape a deployment behind any TLS-terminating proxy
has, and **the only shape in which `frontend.protocolHeader` has an input**:
cloudflared is what puts `X-Forwarded-Proto: https` on the request the cluster
receives.

Both hostnames are one label deep because they have to be — see
[`keycloakHost`](#keycloakhost-and-the-certificate-that-does-not-cover-it).
This mode is also what removed `NODE_TLS_REJECT_UNAUTHORIZED=0`, the line
`values.k3d.yaml` calls the worst in the file: with a real certificate the
frontend does not need it, so the overlay sets `frontend.extraEnv: []` and the
pod runs with node's trust store intact.

**What only a browser can answer** (`browser-check.sh`, 13 checks, Firefox):
signing alice in through the public URL sets
`__Secure-authjs.session-token` (`Secure; HttpOnly; SameSite=Lax`), Firefox
stores it, **no unprefixed twin is set beside it**, `/auth/session` returns
alice and a Keycloak access token, and it survives a full page load.

### Why both modes exist — the result that argues for it

Three experiments through the tunnel, from `e0d2f6d2`:

| change                                            | advertised origin | sign-in POST |
| ------------------------------------------------- | ----------------- | ------------ |
| baseline                                          | `https://…`       | 302          |
| ingress-nginx `use-forwarded-headers: false`      | `http://…`        | **403**      |
| chart `frontend.protocolHeader: ""`               | `https://…`       | 302          |

The 403 is SvelteKit's own `Cross-site POST form submissions are forbidden`:
the app computed an http origin, the browser sent an https `Origin`, and the
CSRF check refused them. Every page still answered 200.

**The third row is the honest result — under real https, removing
`protocolHeader` breaks nothing**, because adapter-node's guess is right by
accident there. Which is precisely why the default mode keeps the app on plain
http. Neither mode subsumes the other: one can catch a scheme bug and cannot
test a cookie prefix; the other is the reverse. **Keep both.**

---

## How this page was checked

Numbers and behaviours here come from one of three places, and it is worth
knowing which.

**Run on 2026-08-14 against a live k3d cluster and `helm template`:** the
required-values list (added one failure at a time until it rendered); `helm
lint`; the rendered annotations, hosts, ExternalName Service and `NOTES.txt`;
the release-name coupling (rendered as `hackapp`); the whole
[`/objects` control table](#the-objects-host-rewrite--the-failure-nobody-diagnoses);
`/auth/providers` advertising `http://` with `PROTOCOL_HEADER` set; the
backend's restart reason read off the live pod; and the unset-`postgresPassword`
claim, by rendering the same input twice and reading two different passwords out
of the two Secrets.

**Read from source, not run:** the liveness probe's fan-out, the five places the
Keycloak hostname is written, the unused helpers, and the plaintext passwords in
the two ConfigMaps.

**Run on 2026-08-14, against the same live cluster, for the config-reload
section:** the bug reproduced with the fix reverted (0.9 s upgrade, ConfigMap
updated, running pod unchanged, generation frozen), the fix observed from inside
the container afterwards, three consecutive identical upgrades leaving every
generation untouched, and the two-render determinism check with the subchart
Secrets as its control. The `verify.sh` checks that pin all of it were then
themselves reverted-and-run, to see them fail.

**Attributed, not re-measured:** the 4k `proxy_buffer_size` 502, the
ExternalName flag experiment, the `use-forwarded-headers` / `protocolHeader`
table, the `__Secure-` browser results, Cloudflare's TLS alert 40 below one
label, and the 13 browser checks — all from `b98fbdda`, `e0d2f6d2` and the
rig's `SKILL.md`. (`verify.sh` was 37 checks in those commits and is 55 now;
the 18 added on 2026-08-14 are the config-reload step above, and they were run.)

## See also

- [storage.md](storage.md) — why uploads work this way, and the prefix policy in
  full.
- [infrastructure.md](infrastructure.md) — what runs today, and the four gaps
  between it and production (I1, the casbin policy that never reloads, is the
  blocker for `replicaCount > 1`).
- [`.claude/skills/k3d-chart-rig/SKILL.md`](../.claude/skills/k3d-chart-rig/SKILL.md)
  — the rig in detail: costs, ports, teardown, and the two DNS traps.
- [getting-started.md](getting-started.md) — the local dev stack, which is not
  this.
