#!/usr/bin/env bash
# Create the Plausible owner account, the site, and a Stats API key — without
# a prompt, a mailbox or a browser. Idempotent: safe to re-run any time.
#
# WHY THIS IS AN `rpc` AND NOT AN HTTP POST, which is worth writing down
# because the HTTP route LOOKS like it exists:
#
#   GET  /register  serves a form with user[name], user[email], user[password],
#                   user[password_confirmation] and a _csrf_token — everything
#                   a scripted signup would need.
#   POST /register  is 404. There is no such route.
#
# The form is a LiveView (`phx-submit="register"`): the account is created by a
# handler on the WEBSOCKET, and the form's native `action="/login"` only runs
# afterwards, to log the new user in. So the visible form cannot be driven with
# curl at all, and openreplay-stack's "POST the signup endpoint" shape has no
# equivalent here. `bin/plausible rpc` runs Elixir inside the release, which is
# the same thing the LiveView handler would have done.
#
# The consequence for anyone reading this later: the code below names INTERNAL
# functions (Plausible.Auth.User.new/1, Plausible.Sites.create/2), so it is
# pinned to a Plausible version in a way an HTTP call would not be. It is
# checked against the ref in vendor/UPSTREAM.txt (v3.2.1) and it FAILS LOUDLY
# rather than half-working: every step matches on its expected result.
#
# Usage: signup.sh [--print]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

bash "$HERE/secrets.sh" >/dev/null
load_secrets
: "${PLAUSIBLE_EMAIL:?}" "${PLAUSIBLE_PASSWORD:?}" "${PLAUSIBLE_SITE:?}"
NAME="${PLAUSIBLE_NAME:-Hackagon Analytics Admin}"

base="$(local_url)"

if [ "${1:-}" = "--print" ]; then
  echo "email      $PLAUSIBLE_EMAIL"
  echo "password   $PLAUSIBLE_PASSWORD"
  echo "site       $PLAUSIBLE_SITE"
  echo "apiKey     ${PLAUSIBLE_API_KEY:-<none yet>}"
  exit 0
fi

cid="$(compose ps -q plausible 2>/dev/null || true)"
[ -n "$cid" ] || {
  echo "error: the plausible container is not running — scripts/up.sh first" >&2
  exit 1
}

rpc() { docker exec -i "$cid" bin/plausible rpc "$1"; }

# ── the owner, the site ────────────────────────────────────────────────────
# `email_verified: true` is set explicitly. ENABLE_EMAIL_VERIFICATION=false
# already means nobody is asked to verify, but the COLUMN still exists and a
# future flip of that variable would otherwise lock this account out of an
# instance with no mailer configured — i.e. permanently.
echo "==> ensuring the owner account and site exist"
out="$(rpc '
email = "'"$PLAUSIBLE_EMAIL"'"
pass = "'"$PLAUSIBLE_PASSWORD"'"
name = "'"$NAME"'"
domain = "'"$PLAUSIBLE_SITE"'"

user =
  case Plausible.Auth.find_user_by(email: email) do
    nil ->
      u =
        %{name: name, email: email, password: pass, password_confirmation: pass}
        |> Plausible.Auth.User.new()
        |> Ecto.Changeset.put_change(:email_verified, true)
        |> Plausible.Repo.insert!()

      IO.puts("user=created")
      u

    u ->
      IO.puts("user=existing")
      u
  end

case Plausible.Sites.get_by_domain(domain) do
  nil ->
    {:ok, %{site: _}} = Plausible.Sites.create(user, %{"domain" => domain, "timezone" => "UTC"})
    IO.puts("site=created")

  _ ->
    IO.puts("site=existing")
end
')"
printf '%s\n' "$out" | sed 's/^/    /'
case "$out" in
  *user=*) ;;
  *)
    echo "error: rpc did not report a user — Plausible internals may have moved" >&2
    exit 1
    ;;
esac

# ── a Stats API key, so a machine can read the numbers back ────────────────
# The dashboard is for humans; verify.sh needs to ASK PLAUSIBLE what it stored,
# and the Stats API is the only answer that goes through Plausible's own query
# layer rather than around it into ClickHouse. Created here rather than clicked
# in the UI for the same reason as everything else in this file.
#
# ⚠ A STORED KEY IS NOT A WORKING KEY, and that is the whole point of the probe
# below. `.secrets.env` deliberately survives `down.sh --volumes` so the owner
# account can be re-created after a wipe — but the API key row was IN the wiped
# database, so the file goes on naming a key that no longer exists. "Is it set"
# would be true and useless; the wipe would look recovered and verify.sh would
# then fail on a 401 several steps later, pointing nowhere near here.
if [ -n "${PLAUSIBLE_API_KEY:-}" ]; then
  probe="$(curl -s -o "$CURL_DISCARD" -w '%{http_code}' -m 20 \
    -H "Authorization: Bearer $PLAUSIBLE_API_KEY" \
    "$base/api/v1/stats/aggregate?site_id=$PLAUSIBLE_SITE&period=day&metrics=visitors" || true)"
  if [ "$probe" != "200" ]; then
    echo "==> the stored Stats API key no longer works (HTTP $probe) — minting a new one"
    PLAUSIBLE_API_KEY=""
  fi
fi

if [ -z "${PLAUSIBLE_API_KEY:-}" ]; then
  echo "==> creating a Stats API key"
  key="$(openssl rand -hex 24 | tr -d '\r\n')"
  keyout="$(rpc '
user = Plausible.Auth.find_user_by(email: "'"$PLAUSIBLE_EMAIL"'")
{:ok, team} = Plausible.Teams.get_by_owner(user)

case Plausible.Auth.create_stats_api_key(user, team, "hackagon-verify", "'"$key"'") do
  {:ok, _} -> IO.puts("apikey=created")
  {:error, e} -> IO.puts("apikey=error " <> inspect(e))
end
')"
  case "$keyout" in
    *apikey=created*)
      # secrets_set REPLACES the line and re-checks `git check-ignore` first —
      # the generator ran once, long ago, and a .gitignore can be edited since.
      secrets_set PLAUSIBLE_API_KEY "$key" || exit 1
      echo "    stored in $SECRETS_FILE"
      ;;
    *)
      echo "    ⚠ could not create a Stats API key: $keyout" >&2
      ;;
  esac
fi

# ── prove the account actually logs IN ─────────────────────────────────────
# A row in Postgres is not a working dashboard. This is the round trip a person
# will make: fetch the form for its CSRF token, post the credentials, follow
# the session to /sites, and find the site listed there. openreplay-stack
# learned to do this too — an account nobody had ever logged into once cost a
# full volume wipe.
echo "==> verifying login at $base"
jar="$(mktemp)"
trap 'rm -f "$jar"' EXIT
# Captured first, then matched: `curl | grep | head` dies with
# `curl: (23) client returned ERROR on write` on a Windows host, because head
# closes the pipe at the first match while curl is still writing.
login_html="$(curl -fsS -c "$jar" "$base/login")"
csrf="$(printf '%s' "$login_html" |
  grep -oE 'name="_csrf_token"[^>]*value="[^"]+"' | sed 's/.*value="//;s/"//' | head -1)"
[ -n "$csrf" ] || {
  echo "error: no CSRF token on $base/login" >&2
  exit 1
}
code="$(curl -fsS -b "$jar" -c "$jar" -o "$CURL_DISCARD" -w '%{http_code}' -X POST "$base/login" \
  --data-urlencode "_csrf_token=$csrf" \
  --data-urlencode "email=$PLAUSIBLE_EMAIL" \
  --data-urlencode "password=$PLAUSIBLE_PASSWORD" || true)"
[ "$code" = "302" ] || {
  echo "error: login answered $code (expected a 302 to /sites)" >&2
  exit 1
}
# Captured, not piped into `grep -q`: grep exits at the first match, and curl
# on a Windows host then dies writing into a closed pipe
# (`curl: (23) client returned ERROR on write`) — a scary line in the middle of
# a successful verification.
sites_html="$(curl -fsS -b "$jar" "$base/sites")"
case "$sites_html" in
  *"$PLAUSIBLE_SITE"*) ;;
  *)
    echo "error: logged in, but $PLAUSIBLE_SITE is not listed on /sites" >&2
    exit 1
    ;;
esac
echo "    login OK, $PLAUSIBLE_SITE listed"

echo ""
echo "  owner    $PLAUSIBLE_EMAIL   (password: $SECRETS_FILE)"
echo "  site     $PLAUSIBLE_SITE"
echo "  apiKey   ${PLAUSIBLE_API_KEY:-<none>}   (Stats API, read-only)"
