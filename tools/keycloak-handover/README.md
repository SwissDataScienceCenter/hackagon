# Keycloak production handover

Two scripts for standing up a **new** production Keycloak from this repo's dev
realm, and getting the credentials to whoever runs the deploy.

Neither script contains a secret. `fill-and-encrypt.sh` generates them at run
time and writes them only into files this directory's `.gitignore` blocks.

## 1. Build the hardened realm

```bash
python3 harden-realm.py \
  ../configs/keycloak/realm-hackagon.json \
  realm-hackagon-prod.json
```

Takes the dev realm and produces a production one: dev users removed,
self-registration off, brute-force protection on, a password policy added, and
both clients made confidential. It writes a `realm-hardening-report.md` beside
the output listing every setting it changed and why, and aborts if the
`hackagon-admin` user's id is not the one the backend expects.

The result is generated, not committed — regenerate it whenever the dev realm
changes.

## 2. Fill in the secrets and encrypt

```bash
./fill-and-encrypt.sh age1<the recipient's public key>
./fill-and-encrypt.sh ./recipients.txt      # or an age recipients file
```

Generates the admin password and the frontend client secret, writes them into
the realm, and produces one file encrypted to that public key:

```
hackagon-realm-handover.tar.age
├── realm.json        # Keycloak imports this at first start
└── CREDENTIALS.md    # the same values, readable, plus the Helm settings
```

Run it in your own terminal — it prints the secrets once, for your password
manager. It shreds the plaintext afterwards and verifies the bundle is _not_
decryptable by you, which is how you know the recipient key took effect.

## Deploying with the result

```bash
helm upgrade --install hackagon ../../helm-chart \
  --set-file realmJson=./realm.json \
  --set baseDomain=<domain> \
  --set backend.config.server.adminkeycloakid=1183370a-46a2-4dad-b8fd-dd927d083e14 \
  --set frontendSecrets.clientSecret=<from CREDENTIALS.md>
```

Three things that fail quietly rather than loudly:

- **`adminkeycloakid`** must equal the `hackagon-admin` user's id in the realm.
  Casbin grants the `admin` role to that id alone, so a mismatch leaves nobody
  an admin and logs nothing. See `helm-chart/values.yaml`.
- **`frontendSecrets.clientSecret`** must equal the `hackagon-frontend` client
  secret in the realm. The client is confidential here, so a mismatch breaks
  login at the callback.
- **Keycloak reads the realm file only when the realm does not yet exist.** On a
  first install that is automatic; on a second deploy the file is ignored in
  silence, so a corrected realm needs Keycloak's database emptied first.

The admin password is written as `temporary`, so Keycloak requires a new one at
first login and the bundle stops being a live secret once it has been used.

Keycloak's own admin-console login is a separate account in the `master` realm.
It is not realm data, so it cannot travel in the bundle — set it explicitly from
a Kubernetes secret as part of the deploy.
