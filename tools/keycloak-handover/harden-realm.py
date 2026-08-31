#!/usr/bin/env python3
"""Produce a production-hardened copy of the Hackagon Keycloak realm.

Reads  tools/configs/keycloak/realm-hackagon.json  (the committed DEV realm)
Writes realm-hackagon-prod.json                    (hardened; placeholders, no secrets)

The two credential slots are left as __REPLACE_* placeholders for
fill-and-encrypt.sh to fill at handover time, so no secret is ever written by
this script.

The dev realm is never modified. Every change is recorded in CHANGES.md so the
diff can be reviewed and, where production is already running, applied by hand
in the prod admin console instead of by import.
"""

import json, sys, pathlib

SRC = pathlib.Path(sys.argv[1])
DST = pathlib.Path(sys.argv[2])
LOG = DST.parent / "CHANGES.md"

# The backend pins this UUID (backend.config.server.adminkeycloakid) and casbin
# grants the `admin` group to it. It MUST survive unchanged.
ADMIN_ID = "1183370a-46a2-4dad-b8fd-dd927d083e14"
KEEP_USERS = {"hackagon-admin"}

# fill-and-encrypt.sh substitutes these. Keeping them here rather than writing a
# real secret means this script's output is safe to inspect and diff.
ADMIN_PW_SLOT = "__REPLACE_ADMIN_PASSWORD__"
FE_SECRET_SLOT = "__REPLACE_FRONTEND_CLIENT_SECRET__"

d = json.loads(SRC.read_text())
changes = []


def setrealm(key, new, why):
    old = d.get(key, "<absent>")
    if old == new:
        changes.append((f"realm.{key}", repr(old), "unchanged", why))
        return
    d[key] = new
    changes.append((f"realm.{key}", repr(old), repr(new), why))


# ---------------------------------------------------------------- realm flags
setrealm(
    "registrationAllowed", False, "dev realm let anyone self-register into production"
)
setrealm(
    "bruteForceProtected",
    True,
    "no lockout on password guessing; failureFactor=30 was already configured but unused",
)
setrealm("eventsEnabled", True, "login auditing for a production realm")
setrealm("adminEventsEnabled", True, "admin-action auditing for a production realm")
setrealm(
    "passwordPolicy",
    "length(12) and upperCase(1) and lowerCase(1) and digits(1) "
    "and specialChars(1) and notUsername(undefined)",
    "no password policy was set at all",
)

# Deliberately NOT changed -- reasons recorded so the decision is visible.
for key, why in [
    (
        "sslRequired",
        "stays 'external': the backend fetches JWKS over plain HTTP "
        "inside the cluster (http://<svc>:8080/...), which 'all' would reject",
    ),
    (
        "resetPasswordAllowed",
        "stays false: smtpServer is {} -- enable only once SMTP is configured",
    ),
    (
        "verifyEmail",
        "stays false: smtpServer is {} -- enable only once SMTP is configured",
    ),
]:
    changes.append((f"realm.{key}", repr(d.get(key)), "unchanged", why))

# ---------------------------------------------------------------------- users
removed = [u["username"] for u in d.get("users", []) if u["username"] not in KEEP_USERS]
d["users"] = [u for u in d.get("users", []) if u["username"] in KEEP_USERS]
changes.append(
    (
        "realm.users",
        ", ".join(sorted(removed)) or "-",
        "removed",
        "dev accounts with the publicly documented password 'aliceandbob'",
    )
)

admins = [u for u in d["users"] if u["username"] == "hackagon-admin"]
if len(admins) != 1:
    sys.exit("expected exactly one hackagon-admin user, found %d" % len(admins))
admin = admins[0]
if admin["id"] != ADMIN_ID:
    sys.exit(
        "hackagon-admin id %s != pinned adminkeycloakid %s" % (admin["id"], ADMIN_ID)
    )
changes.append(
    (
        "users.hackagon-admin.id",
        ADMIN_ID,
        "unchanged (asserted)",
        "backend.config.server.adminkeycloakid + casbin admin grant depend on it",
    )
)

had_creds = bool(admin.pop("credentials", None))
# `temporary` is what makes the handover safe: Keycloak forces a new password at
# first login, so the plaintext in the delivered bundle dies on first use.
admin["credentials"] = [{"type": "password", "value": ADMIN_PW_SLOT, "temporary": True}]
admin.setdefault("requiredActions", [])
changes.append(
    (
        "users.hackagon-admin.credentials",
        "argon2id hash present" if had_creds else "-",
        "placeholder, temporary=True",
        "the dev hash is dropped and the slot left for "
        "fill-and-encrypt.sh; Keycloak hashes the value at import and "
        "demands a replacement at first login",
    )
)

# ------------------------------------------------------------------- clients
by_id = {c["clientId"]: c for c in d["clients"]}

fe = by_id["hackagon-frontend"]
changes.append(
    (
        "clients.hackagon-frontend.publicClient",
        repr(fe["publicClient"]),
        "False",
        "the SvelteKit frontend is a confidential server-side client, and the chart "
        "already requires frontendSecrets.clientSecret",
    )
)
fe["publicClient"] = False
fe.setdefault("attributes", {})["pkce.code.challenge.method"] = "S256"
changes.append(
    (
        "clients.hackagon-frontend.attributes[pkce.code.challenge.method]",
        "<absent>",
        "S256",
        "bind the auth code to the requesting client",
    )
)
changes.append(
    (
        "clients.hackagon-frontend.directAccessGrantsEnabled",
        repr(fe["directAccessGrantsEnabled"]),
        "False",
        "the frontend uses the authorization code flow; password grant is not needed",
    )
)
fe["directAccessGrantsEnabled"] = False
fe["secret"] = FE_SECRET_SLOT
changes.append(
    (
        "clients.hackagon-frontend.secret",
        "<absent>",
        "placeholder",
        "a confidential client with no `secret` gets a RANDOM one at "
        "import, which then cannot match frontendSecrets.clientSecret "
        "and breaks login at the callback",
    )
)
changes.append(
    (
        "clients.hackagon-frontend.redirectUris / webOrigins / post.logout.redirect.uris",
        "http://localhost:8081...",
        "unchanged ON PURPOSE",
        "keycloak-realm-configmap.yaml rewrites these localhost strings to the real "
        "host at template time -- editing them here breaks that rewrite",
    )
)

be = by_id["hackagon-backend"]
changes.append(
    (
        "clients.hackagon-backend.publicClient",
        repr(be["publicClient"]),
        "False",
        "the backend only validates JWTs; it must not be a public client",
    )
)
be["publicClient"] = False
for k in ("standardFlowEnabled", "directAccessGrantsEnabled"):
    changes.append(
        (
            f"clients.hackagon-backend.{k}",
            repr(be[k]),
            "False",
            "the backend is an audience/resource server, it initiates no login flow",
        )
    )
    be[k] = False
for k in ("redirectUris", "webOrigins"):
    changes.append(
        (
            f"clients.hackagon-backend.{k}",
            repr(be[k]),
            "[]",
            "wildcard '/*' on a client that runs no browser flow",
        )
    )
    be[k] = []

DST.write_text(json.dumps(d, indent=2) + "\n")

# --------------------------------------------------------------------- report
rows = "\n".join(f"| `{n}` | {o} | {v} | {w} |" for n, o, v, w in changes)
LOG.write_text(f"""# Hardening applied to `{DST.name}`

Source: `{SRC}` (the committed **dev** realm, unmodified).

`{DST.name}` contains **no secret material** — the two credential slots hold
`__REPLACE_*` placeholders that `fill-and-encrypt.sh` substitutes at handover
time. It is safe to review and diff in the clear.

| Setting | Dev value | Prod value | Why |
| --- | --- | --- | --- |
{rows}

## Not done here, needs a human decision

- **TOTP on the admin account** — add `"requiredActions": ["CONFIGURE_TOTP"]` to
  `hackagon-admin`, or enrol it in the prod console. Strongly advisable for a
  production admin, but it means the recipient must enrol before first use.
- **`bearerOnly: true` on `hackagon-backend`** — the most correct setting for a
  pure resource server, left off to avoid surprising a running deployment.
- **`revokeRefreshToken: true`** — reduces refresh-token replay, but shortens
  live sessions. Behavioural change, not applied blind.
- **Realm role/group cruft** — the realm still carries `data-controller` /
  `data-processor` roles and two `data-controller::<uuid>` / `data-processor::<uuid>`
  groups, and `hackagon-admin` sits in the `data-processor::…` group. Nothing in
  this codebase reads them (authorisation is casbin, keyed on the Keycloak user
  id). They look like leftovers from another portal; confirm before deleting.
""")

print(f"wrote {DST}")
print(f"wrote {LOG}")
print(f"{len(changes)} settings recorded, {len(removed)} dev users removed")
