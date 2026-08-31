#!/usr/bin/env bash
#
# Build the encrypted handover bundle for a first Hackagon production install.
#
# Produces ONE file, encrypted to your coworker's age public key, containing:
#   realm.json      - the hardened Keycloak realm, password already filled in
#   CREDENTIALS.md  - the same secrets, readable, so nobody greps 84 kB of JSON
#
# Usage:
#   ./fill-and-encrypt.sh age1<the recipient's public key>
#   ./fill-and-encrypt.sh ./coworker-recipients.txt
#
# RUN THIS YOURSELF, IN YOUR OWN TERMINAL. Not through Claude, not in a shared
# session: it prints the generated secrets, and a shared session keeps a
# transcript of everything printed in it.
set -euo pipefail
cd "$(dirname "$0")"

IN=realm-hackagon-prod.json
BUNDLE=hackagon-realm-handover.tar
ENC="$BUNDLE.age"
ADMIN_ID=1183370a-46a2-4dad-b8fd-dd927d083e14

usage() {
    sed -n '3,13p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
}
[ $# -eq 1 ] || usage
RECIPIENT="$1"

command -v age >/dev/null || {
    echo "need age: https://github.com/FiloSottile/age" >&2
    exit 1
}
command -v openssl >/dev/null || {
    echo "need openssl" >&2
    exit 1
}
[ -f "$IN" ] || {
    echo "missing $IN" >&2
    exit 1
}
grep -q '__REPLACE_ADMIN_PASSWORD__' "$IN" || {
    echo "$IN has no placeholders left" >&2
    exit 1
}

# Work out how to pass the recipient to age, and refuse a malformed key rather
# than producing a bundle nobody can open.
if [ -f "$RECIPIENT" ]; then
    AGE_ARGS=(-R "$RECIPIENT")
    echo "Recipients file: $RECIPIENT ($(grep -c . "$RECIPIENT") line(s))"
elif [[ $RECIPIENT =~ ^age1[0-9a-z]{58}$ ]]; then
    AGE_ARGS=(-r "$RECIPIENT")
    echo "Recipient key:   ${RECIPIENT:0:12}…${RECIPIENT: -6}"
elif [[ $RECIPIENT == ssh-* ]]; then
    AGE_ARGS=(-r "$RECIPIENT")
    echo "Recipient key:   ssh key"
else
    echo "Not a valid age recipient: expected an age1… key (62 chars), an ssh-… key," >&2
    echo "or a path to a recipients file. Got: ${RECIPIENT:0:20}…" >&2
    exit 1
fi

# 20 url-safe chars plus a literal special char, so the realm's own password
# policy (length 12, upper, lower, digit, special) is met without a retry loop.
ADMIN_PW="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)!aA1"
FE_SECRET="$(openssl rand -hex 32)"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
chmod 700 "$STAGE"

python3 - "$IN" "$STAGE/realm.json" "$ADMIN_PW" "$FE_SECRET" <<'PY'
import sys, pathlib, json
src, dst, pw, sec = sys.argv[1:5]
t = pathlib.Path(src).read_text()
assert t.count('__REPLACE_ADMIN_PASSWORD__') == 1
assert t.count('__REPLACE_FRONTEND_CLIENT_SECRET__') == 1
t = t.replace('__REPLACE_ADMIN_PASSWORD__', json.dumps(pw)[1:-1])
t = t.replace('__REPLACE_FRONTEND_CLIENT_SECRET__', sec)
d = json.loads(t)                                    # valid JSON after substitution
assert [u['username'] for u in d['users']] == ['hackagon-admin']
assert d['users'][0]['credentials'][0]['temporary'] is True
pathlib.Path(dst).write_text(t)
PY

cat >"$STAGE/CREDENTIALS.md" <<CRED
# Hackagon production credentials

Generated $(date -u '+%Y-%m-%d %H:%M UTC'). Move these into your password
manager, then delete this file. They are also embedded in \`realm.json\`, which
Keycloak reads at first start — you do not need to enter them there.

| What | Value |
| --- | --- |
| Admin username | \`hackagon-admin\` |
| Admin password | \`$ADMIN_PW\` |
| Frontend client secret | \`$FE_SECRET\` |

The admin password is **temporary**: Keycloak will require a new one at first
login. That is intentional — once you have changed it, this bundle is no longer
a live secret.

## Two values Helm needs

\`\`\`bash
--set backend.config.server.adminkeycloakid=$ADMIN_ID
--set frontendSecrets.clientSecret=$FE_SECRET
\`\`\`

Both fail silently if wrong. A mismatched \`clientSecret\` breaks login at the
callback; a wrong \`adminkeycloakid\` leaves nobody with admin rights and logs
nothing to say so.

## Not in this bundle — you set it yourself

**Keycloak's own admin console password** (the \`master\` realm login). It is not
realm data and cannot be delivered this way. The Helm chart defines no value for
it, so set it explicitly from a Kubernetes secret before exposing the hostname.
CRED

chmod 600 "$STAGE"/*
tar -cf "$BUNDLE" -C "$STAGE" realm.json CREDENTIALS.md
age "${AGE_ARGS[@]}" -o "$ENC" "$BUNDLE"
shred -u "$BUNDLE" 2>/dev/null || rm -f "$BUNDLE"

# Sealed to their key means you cannot open it either. Confirm that here rather
# than discovering the recipient was wrong after they have already tried.
if age -d "$ENC" >/dev/null 2>&1; then
    echo "WARNING: you can decrypt this bundle — check the recipient key" >&2
else
    echo "✓ sealed: not decryptable by you, only by the recipient"
fi
SHA="$(shasum -a 256 "$ENC" | cut -d' ' -f1)"

cat <<REPORT

==========================================================
 Save these in your password manager now, then close this.
==========================================================
 hackagon-admin password (temporary):
   $ADMIN_PW

 hackagon-frontend client secret:
   $FE_SECRET
==========================================================

Send:      $ENC   ($(wc -c <"$ENC" | tr -d ' ') bytes)
Checksum:  $SHA

  Send the checksum over a channel they know is you (Slack, Signal, voice).
  Anyone can encrypt to a public key, so the bundle alone does not prove who
  sent it.

They open it with:
  age -d -i ~/.config/age/keys.txt $ENC | tar -x
REPORT
