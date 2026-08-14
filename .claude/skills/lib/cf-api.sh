# shellcheck shell=bash
# Cloudflare API access for NAMED tunnels — credentials, zone lookup, tunnel
# records, DNS records. Source it (it only defines functions and constants):
#
#   HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$HERE/../../lib/cf-api.sh"
#
# WHY NAMED TUNNELS EXIST HERE AT ALL. A quick tunnel hands out a fresh
# *.trycloudflare.com hostname on every start, and that one fact is the root of
# most of the churn in this repo's tunnel tooling: auth-wire.sh re-points BOTH
# OIDC issuers at each new URL, run.sh unwires and re-wires around every suite,
# the adapter-node build reads its issuer once at boot and goes stale, and a
# dead hostname once sat committed in HEAD for several commits. A stable
# hostname removes the CAUSE rather than the symptoms: wire it once and it stays
# correct across restarts, reboots and rebuilds.
#
# Quick tunnels are NOT replaced. They are the zero-config path for anyone
# without a Cloudflare account, and every rig still falls back to one.
#
# ── THE CREDENTIAL ───────────────────────────────────────────────────────────
#
# Read from a gitignored .env (see cf_env_file below). This file REFUSES to
# read or write it unless `git check-ignore` says git cannot take it — the same
# discipline .secrets.env has in openreplay-stack and plausible-stack, and for
# the same reason: a rule that is present-but-wrong looks exactly like a rule
# that works, so ask git rather than reading .gitignore.
#
# THE TOKEN IS NEVER ECHOED. Not in a log line, not in an error, not in a file
# this code writes, and not in argv — the Authorization header goes to curl
# through `--config -` (stdin), so it never appears in `ps` output on a shared
# machine. Progress output names the HOSTNAME, never the credential.
#
# ⚠ Cloudflare API tokens scope to a ZONE, not to a hostname. A token that can
# edit DNS in example.org can edit ANY record in that zone, including ones
# this tooling never created. There is no narrower grant; see SKILL.md.
#
# ── DEPENDENCIES ─────────────────────────────────────────────────────────────
#
# curl and docker. jq is used when present and otherwise run from the official
# `ghcr.io/jqlang/jq` image — docker is already a hard requirement of every
# script that sources this, and the Git Bash host these scripts run on has no
# jq. Override with HACKAGON_JQ=/path/to/jq.

CF_API="https://api.cloudflare.com/client/v4"

# Where the credentials live. ONE location, deliberately: copying a token to a
# second path is how one of them goes stale and how a rotation misses a copy.
# The cloudflare-tunnel skill owns Cloudflare credentials, so the file lives
# beside it; HACKAGON_CF_ENV moves it (move the file, do not duplicate it).
cf_env_file() {
  if [ -n "${HACKAGON_CF_ENV:-}" ]; then
    echo "$HACKAGON_CF_ENV"
    return 0
  fi
  local skills root
  skills="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  root="$(cd "$skills/../.." && pwd)"
  if [ -f "$skills/cloudflare-tunnel/.env" ]; then
    echo "$skills/cloudflare-tunnel/.env"
  elif [ -f "$root/.env" ] && grep -q '^CLOUDFLARE_API_TOKEN=' "$root/.env" 2>/dev/null; then
    # Repo root is where people put a .env by reflex. Accepted, but only when
    # it really is the Cloudflare one — this repo has other .env files.
    echo "$root/.env"
  else
    echo "$skills/cloudflare-tunnel/.env"
  fi
}

# Machine-local state: per-tunnel credentials files and cloudflared configs.
# `.claude/**/.state/` is gitignored repo-wide.
cf_state_dir() {
  local skills
  skills="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  echo "${HACKAGON_CF_STATE:-$skills/cloudflare-tunnel/.state}"
}

# A secret is about to be read from (or written to) this path. Ask git whether
# it could ever be committed, and refuse if it could. Not "does .gitignore
# mention it" — `git check-ignore` is the only answer that accounts for
# negations, precedence and a nested .gitignore.
cf_guard_gitignored() { # <path>
  local f="${1:?}" dir
  dir="$(dirname "$f")"
  command -v git >/dev/null 2>&1 || return 0
  git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  git -C "$dir" check-ignore -q "$f" && return 0
  echo "error: $f is NOT gitignored — refusing to touch a Cloudflare token there." >&2
  echo "       git could commit it. Add it to .gitignore first." >&2
  return 1
}

# Load CLOUDFLARE_* / *_HOSTNAME from the env file. Explicit environment wins,
# so `CLOUDFLARE_ZONE=other bash up.sh` overrides on purpose.
#
# The `\r` strip is load-bearing on Windows and cost an hour in plausible-stack:
# a CR that rides INSIDE a value (not at the end of the line, where every tool
# would treat it as a line ending) survives every obvious inspection and makes
# the far end reject a credential that looks byte-perfect everywhere you check.
cf_load() {
  local f
  f="$(cf_env_file)"
  [ -f "$f" ] || return 1
  cf_guard_gitignored "$f" || return 1
  local line k v
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in '' | \#*) continue ;; esac
    k="${line%%=*}"
    case "$k" in *[!A-Za-z0-9_]* | '') continue ;; esac
    v="${line#*=}"
    v="${v%$'\r'}"
    [ -n "${!k:-}" ] || export "$k=$v"
  done <"$f"
  [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ZONE:-}" ]
}

# "Is named mode available at all?" — the question up.sh asks before choosing a
# mode. Silent: callers decide what to print.
cf_configured() { cf_load >/dev/null 2>&1; }

# Explain the absence in the terms someone can act on. Never prints a value.
cf_explain_unconfigured() {
  local f
  f="$(cf_env_file)"
  if [ ! -f "$f" ]; then
    echo "  no Cloudflare credentials at $f"
    echo "  (copy .env.example beside it and fill it in — see SKILL.md,"
    echo "   'Named tunnels', for the exact token to mint)"
  else
    echo "  $f exists but has no CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE pair"
  fi
}

# ── jq, wherever it is ───────────────────────────────────────────────────────
# The Git Bash host has no jq; the dev container does; the docker image is the
# floor. Resolved once per process.
CF_JQ=""
cf_jq_init() {
  [ -z "$CF_JQ" ] || return 0
  if [ -n "${HACKAGON_JQ:-}" ]; then
    CF_JQ="native:$HACKAGON_JQ"
  elif command -v jq >/dev/null 2>&1; then
    CF_JQ="native:jq"
  else
    CF_JQ="docker"
  fi
}

# Filter stdin. Always -r: every caller here wants a bare string or an id.
jqr() { # <filter>
  cf_jq_init
  case "$CF_JQ" in
    native:*) "${CF_JQ#native:}" -r "$1" ;;
    docker)
      # -i, not argv: the JSON may carry a tunnel secret, and stdin to a local
      # container keeps it off every process list on the box.
      docker run --rm -i "${HACKAGON_JQ_IMAGE:-ghcr.io/jqlang/jq:1.7.1}" -r "$1"
      ;;
  esac
}

# ── the API ──────────────────────────────────────────────────────────────────
#
# The bearer token goes through `curl --config -` on STDIN. Putting it in argv
# (`-H "Authorization: Bearer $T"`) publishes it to every process listing on the
# machine for the life of the request; this does not. The request body is not a
# secret and stays on the command line.
cf_api() { # <METHOD> <path> [json-body] -> response JSON on stdout
  local method="$1" path="$2" body="${3:-}"
  local -a args=(-sS -X "$method" --max-time 30
    -H "Content-Type: application/json" "$CF_API$path")
  [ -n "$body" ] && args+=(-d "$body")
  printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" |
    curl --config - "${args[@]}"
}

# Cloudflare answers 200 with `"success": false` for most failures, so an exit
# code is not the check. Reads the response on stdin, re-emits it when it is
# good, and names the failure when it is not.
#
# The error text comes back from Cloudflare and never contains the token, but it
# is piped rather than interpolated into a message anyway — one fewer place a
# future edit could widen.
cf_ok() { # <what-was-attempted>   (response on stdin, response on stdout)
  local what="$1" resp
  resp="$(cat)"
  if [ "$(printf '%s' "$resp" | jqr '.success // false')" = "true" ]; then
    printf '%s' "$resp"
    return 0
  fi
  {
    echo "error: Cloudflare refused: $what"
    printf '%s' "$resp" | jqr '
      if (.errors | length) > 0
      then (.errors[] | "       [\(.code)] \(.message)")
      else "       (no error detail in the response)" end' 2>/dev/null ||
      echo "       (unparseable response)"
  } >&2
  return 1
}

# Is the token alive, and what can it do? Run before anything else: an expired
# or mis-scoped token otherwise surfaces as a confusing failure three calls
# later, on whichever permission happens to be checked first.
cf_verify_token() {
  local resp status
  resp="$(cf_api GET /user/tokens/verify)" || return 1
  status="$(printf '%s' "$resp" | jqr '.result.status // "unknown"')"
  if [ "$(printf '%s' "$resp" | jqr '.success // false')" != "true" ]; then
    echo "error: the Cloudflare API token was rejected (status: $status)." >&2
    echo "       Mint a new one — SKILL.md, 'Named tunnels' → 'The token'." >&2
    return 1
  fi
  [ "$status" = "active" ] || {
    echo "error: the token verifies but its status is '$status', not 'active'." >&2
    return 1
  }
  return 0
}

# ── zone ─────────────────────────────────────────────────────────────────────
# One call answers both ids. Deriving the ACCOUNT id from the zone is why this
# tooling needs no `Account → Account Settings → Read` permission: the zone
# record carries it.
CF_ZONE_ID=""
CF_ACCOUNT_ID=""
cf_resolve_zone() {
  [ -z "$CF_ZONE_ID" ] || return 0
  local resp count st
  resp="$(cf_api GET "/zones?name=$CLOUDFLARE_ZONE")" || return 1
  printf '%s' "$resp" | cf_ok "looking up the zone $CLOUDFLARE_ZONE" >/dev/null || return 1
  count="$(printf '%s' "$resp" | jqr '.result | length')"
  if [ "$count" = "0" ]; then
    echo "error: the token cannot see a zone named '$CLOUDFLARE_ZONE'." >&2
    echo "       Either the name is wrong, or the token was not granted" >&2
    echo "       Zone → DNS → Edit on THAT zone (zone resources are opt-in)." >&2
    return 1
  fi
  CF_ZONE_ID="$(printf '%s' "$resp" | jqr '.result[0].id')"
  CF_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(printf '%s' "$resp" | jqr '.result[0].account.id')}"
  st="$(printf '%s' "$resp" | jqr '.result[0].status')"
  if [ "$st" != "active" ]; then
    # Worth failing on: a pending zone accepts DNS writes and resolves nothing,
    # so every later step succeeds and the hostname stays dead.
    echo "error: zone $CLOUDFLARE_ZONE is '$st', not 'active' — Cloudflare is not" >&2
    echo "       authoritative for it yet, so a record written now resolves nowhere." >&2
    return 1
  fi
  return 0
}

# ── tunnels ──────────────────────────────────────────────────────────────────
cf_tunnel_id() { # <name> -> id on stdout, empty when absent
  local resp
  resp="$(cf_api GET "/accounts/$CF_ACCOUNT_ID/cfd_tunnel?name=$1&is_deleted=false")" || return 1
  printf '%s' "$resp" | cf_ok "listing tunnels" >/dev/null || return 1
  printf '%s' "$resp" | jqr '.result[0].id // empty'
}

cf_tunnel_create() { # <name> <base64-secret> -> id on stdout
  local resp
  # config_src=local: the ingress rules live in a file on this machine (and are
  # therefore reviewable here) rather than in the Cloudflare dashboard.
  resp="$(cf_api POST "/accounts/$CF_ACCOUNT_ID/cfd_tunnel" \
    "{\"name\":\"$1\",\"tunnel_secret\":\"$2\",\"config_src\":\"local\"}")" || return 1
  printf '%s' "$resp" | cf_ok "creating the tunnel '$1'" >/dev/null || return 1
  printf '%s' "$resp" | jqr '.result.id'
}

cf_tunnel_delete() { # <id>
  cf_api DELETE "/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$1" |
    cf_ok "deleting tunnel $1" >/dev/null
}

# The run token is base64 of {"a":account,"t":tunnel,"s":secret} — the same three
# fields a credentials file holds. That equivalence is what makes an existing
# tunnel recoverable: Cloudflare never returns the secret from the create call
# again, so without this a lost credentials file would mean deleting and
# recreating the tunnel (and re-pointing DNS) to get back to a working state.
cf_tunnel_token() { # <id> -> base64 token on stdout
  local resp
  resp="$(cf_api GET "/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$1/token")" || return 1
  printf '%s' "$resp" | cf_ok "fetching the run token for tunnel $1" >/dev/null || return 1
  printf '%s' "$resp" | jqr '.result'
}

# ── DNS ──────────────────────────────────────────────────────────────────────
# A proxied CNAME to <tunnel-id>.cfargotunnel.com is what makes a hostname
# resolve to the tunnel. `proxied: true` is mandatory, not a preference — an
# unproxied cfargotunnel.com name does not resolve publicly at all.
CF_DNS_COMMENT="hackagon dev tunnel — managed by .claude/skills/lib/cf-named-tunnel.sh"

cf_dns_find() { # <fqdn> -> "<id> <type> <content>" on stdout, empty when absent
  local resp
  resp="$(cf_api GET "/zones/$CF_ZONE_ID/dns_records?name=$1")" || return 1
  printf '%s' "$resp" | cf_ok "listing DNS records for $1" >/dev/null || return 1
  printf '%s' "$resp" | jqr '.result[0] | if . == null then empty
    else "\(.id) \(.type) \(.content)" end'
}

# Point <fqdn> at <tunnel-id>. Idempotent, and it REFUSES to overwrite a record
# it did not create.
#
# That refusal is the whole safety story of this function. The token is
# zone-wide: nothing in Cloudflare stops this code from replacing the zone's
# apex, a mail record, or a colleague's staging host if a hostname were
# mistyped in .env. So anything that is not already a cfargotunnel.com CNAME is
# left alone and reported, and CF_FORCE_DNS=1 is the deliberate override.
cf_dns_point() { # <fqdn> <tunnel-id>
  local fqdn="$1" tid="$2" target="$2.cfargotunnel.com" existing rid rtype rcontent
  local body
  body="$(printf '{"type":"CNAME","name":"%s","content":"%s","proxied":true,"ttl":1,"comment":"%s"}' \
    "$fqdn" "$target" "$CF_DNS_COMMENT")"

  existing="$(cf_dns_find "$fqdn")" || return 1
  if [ -z "$existing" ]; then
    cf_api POST "/zones/$CF_ZONE_ID/dns_records" "$body" |
      cf_ok "creating the CNAME $fqdn → $target" >/dev/null || return 1
    echo "    DNS  created  $fqdn → $target (proxied)"
    return 0
  fi

  read -r rid rtype rcontent <<<"$existing"
  if [ "$rtype" = "CNAME" ] && [ "$rcontent" = "$target" ]; then
    echo "    DNS  ok       $fqdn → $target"
    return 0
  fi
  case "$rtype:$rcontent" in
    CNAME:*.cfargotunnel.com) ;; # ours, pointing at a different tunnel — repoint
    *)
      if [ "${CF_FORCE_DNS:-0}" != "1" ]; then
        echo "error: $fqdn already has a $rtype record that this tooling did not create." >&2
        echo "       Refusing to replace it. The API token is ZONE-wide, so a typo" >&2
        echo "       here could take out an unrelated hostname." >&2
        echo "       Override deliberately with CF_FORCE_DNS=1 if it really is stale." >&2
        return 1
      fi
      echo "    DNS  ⚠ replacing a $rtype record (CF_FORCE_DNS=1)"
      ;;
  esac
  cf_api PATCH "/zones/$CF_ZONE_ID/dns_records/$rid" "$body" |
    cf_ok "repointing $fqdn → $target" >/dev/null || return 1
  echo "    DNS  updated  $fqdn → $target (proxied)"
}

cf_dns_delete() { # <fqdn> — only when it is one of ours
  local existing rid rtype rcontent
  existing="$(cf_dns_find "$1")" || return 1
  [ -n "$existing" ] || {
    echo "    DNS  absent   $1"
    return 0
  }
  read -r rid rtype rcontent <<<"$existing"
  case "$rtype:$rcontent" in
    CNAME:*.cfargotunnel.com)
      cf_api DELETE "/zones/$CF_ZONE_ID/dns_records/$rid" |
        cf_ok "deleting the CNAME $1" >/dev/null || return 1
      echo "    DNS  deleted  $1"
      ;;
    *)
      echo "    DNS  left alone: $1 is a $rtype this tooling did not create" >&2
      ;;
  esac
}
