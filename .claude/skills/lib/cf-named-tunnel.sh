#!/usr/bin/env bash
# Run a Cloudflare NAMED tunnel — a tunnel with a PERSISTENT hostname on a zone
# you own, instead of a quick tunnel's throwaway *.trycloudflare.com.
#
#   cf-named-tunnel.sh up      <name> <fqdn> <network> <service-url> [fqdn…]
#   cf-named-tunnel.sh ensure  <name> <fqdn> [fqdn…]    # Cloudflare side only
#   cf-named-tunnel.sh stop    <name>
#   cf-named-tunnel.sh status  [name]
#   cf-named-tunnel.sh url     <name>                   # from the RUNNING container
#   cf-named-tunnel.sh running <name>                   # exit 0 when it is
#   cf-named-tunnel.sh destroy <name> <fqdn> [fqdn…]    # tunnel + DNS + container
#   cf-named-tunnel.sh check                            # credentials + zone only
#
# e.g.  cf-named-tunnel.sh up hackagon hackagon.example.org \
#           hackagon-dev http://caddy:80
#
# ONE TUNNEL PER RIG, not one tunnel with three ingress rules. The three rigs
# live in three different compose projects on three different docker networks
# (hackagon-dev, plausible_default, openreplay_openreplay-net); a single
# cloudflared would have to be attached to all three and restarted whenever any
# rig came up or down. Per-rig tunnels are independent, they mirror the
# quick-tunnel-per-rig design that is already here, and a rig that is down
# simply has no tunnel rather than breaking the others'.
#
# ── SEVERAL HOSTNAMES, ONE RIG ───────────────────────────────────────────────
#
# The rule above is per RIG, not per hostname, and one rig can legitimately need
# more than one public name: the k3d chart rig serves the app and Keycloak from
# two host-based Ingresses on the same ingress controller, because the chart
# routes them by Host. Those extra names take TRAILING ARGUMENTS and share the
# ONE service URL — which is the whole point, since the thing behind the tunnel
# is a single proxy that dispatches on Host itself. A second tunnel would be a
# second container, a second thing to start and stop in step, and a second way
# to leave half a rig public.
#
# Every hostname must be inside the same zone (the token can write nowhere
# else), they all get their own proxied CNAME to the same tunnel, and `destroy`
# takes the same list so no record outlives the tunnel it points at.
#
# ⚠ Cloudflare's free Universal SSL covers the apex and ONE label
# (`example.org`, `a.example.org`) and nothing deeper. `a.b.example.org` gets no
# certificate at the edge and fails the TLS handshake outright — measured, alert
# 40, before anything was created. Pick sibling names, not nested ones, unless
# the zone has Advanced Certificate Manager.
#
# ── WHAT RUNS, AND WITH WHICH CREDENTIAL ─────────────────────────────────────
#
# The container runs cloudflared with a LOCALLY-MANAGED config: a per-tunnel
# credentials file plus an ingress file, both under .state/named/<name>/ and
# both gitignored, mounted read-only at /etc/cloudflared.
#
# This is deliberate and it is the security point. The API token is a SETUP
# credential — it creates the tunnel and writes the DNS record, once. The
# credentials file is the RUN-TIME credential, and it can do exactly one thing:
# serve traffic for that one tunnel. It cannot touch DNS, cannot see the zone,
# and cannot create anything. A machine that only needs to RUN a tunnel should
# hold the credentials file and no token at all — copy .state/named/<name>/ to
# it and never put the .env there.
#
# The alternative (`cloudflared tunnel run --token …`, ingress managed in the
# Cloudflare dashboard) needs no files but puts the ingress rules somewhere this
# repo cannot review or diff, and the run token is a full tunnel credential
# either way. Local config keeps the routing table on disk, next to the
# Caddyfile it hands off to.
set -euo pipefail
CFN_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./cf-api.sh
source "$CFN_HERE/cf-api.sh"

# Paths handed to docker.exe. On Git Bash/MSYS the automatic POSIX→Windows
# translation has to be off for docker's own /container/paths to survive, which
# means a /c/Users/... host path would reach docker.exe verbatim and resolve as
# C:\c\Users\... — hand it a Windows-style path instead. Same fix as
# openreplay-stack/scripts/lib.sh and plausible-stack/scripts/lib.sh.
CURL_DISCARD="/dev/null"
case "$(uname -s)" in
  MINGW* | MSYS*)
    export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"
    # …and not /dev/null either: curl.exe would try to create a file at that
    # literal path and print `client returned ERROR on write` in the middle of
    # a check that then passes anyway.
    CURL_DISCARD="NUL"
    ;;
esac

CFN_IMAGE="${HACKAGON_CLOUDFLARED_IMAGE:-cloudflare/cloudflared:latest}"

cfn_container() { echo "cf-named-${1:?}"; }
cfn_dir() { echo "$(cf_state_dir)/named/${1:?}"; }
cfn_dir_docker() { # host path in the form docker.exe accepts
  local d
  d="$(cfn_dir "$1")"
  case "$(uname -s)" in MINGW* | MSYS*) cygpath -m "$d" ;; *) echo "$d" ;; esac
}

# ── Cloudflare side ──────────────────────────────────────────────────────────
# Create-or-reuse the tunnel, make sure we hold its credentials, point DNS at
# it. Idempotent: run it as often as you like.
cfn_ensure() { # <name> <fqdn> [fqdn…]
  local name="$1" fqdn="$2" dir tid secret token host
  shift 2
  local extras=("$@")
  dir="$(cfn_dir "$name")"

  cf_load || {
    echo "error: no usable Cloudflare credentials." >&2
    cf_explain_unconfigured >&2
    return 1
  }
  cf_verify_token || return 1
  cf_resolve_zone || return 1

  # Every fqdn must be inside the zone the token can edit. Checked here because
  # the API's own error for this is a bare "record name is invalid".
  for host in "$fqdn" "${extras[@]}"; do
    case "$host" in
      *".$CLOUDFLARE_ZONE" | "$CLOUDFLARE_ZONE") ;;
      *)
        echo "error: '$host' is not inside the zone '$CLOUDFLARE_ZONE'." >&2
        echo "       The token is scoped to that zone and can write nowhere else." >&2
        return 1
        ;;
    esac
  done

  mkdir -p "$dir"
  cf_guard_gitignored "$dir/credentials.json" || return 1

  tid="$(cf_tunnel_id "$name")" || return 1
  if [ -z "$tid" ]; then
    echo "==> Creating the named tunnel '$name'…"
    # tr -d '\r\n', not '\n': Git Bash's openssl prints CRLF, and a CR inside a
    # base64 secret is not a line ending, it is a byte in the credential.
    secret="$(openssl rand -base64 32 | tr -d '\r\n')"
    tid="$(cf_tunnel_create "$name" "$secret")" || return 1
    umask 077
    printf '{"AccountTag":"%s","TunnelSecret":"%s","TunnelID":"%s"}\n' \
      "$CF_ACCOUNT_ID" "$secret" "$tid" >"$dir/credentials.json"
    echo "    tunnel   created  $name ($tid)"
  else
    echo "    tunnel   reusing  $name ($tid)"
    if [ ! -s "$dir/credentials.json" ]; then
      # Cloudflare will not hand the creation secret back, but the RUN TOKEN is
      # base64 of the same three fields — so an existing tunnel whose
      # credentials file was lost is recoverable without deleting it and
      # re-pointing DNS.
      echo "    creds    missing — rebuilding from the tunnel's run token"
      token="$(cf_tunnel_token "$tid")" || return 1
      umask 077
      printf '%s' "$token" | base64 -d 2>/dev/null |
        jqr '{AccountTag: .a, TunnelSecret: .s, TunnelID: .t}' >"$dir/credentials.json.tmp" || {
        echo "error: could not decode the run token into a credentials file." >&2
        rm -f "$dir/credentials.json.tmp"
        return 1
      }
      # jqr is -r, which prints the object as JSON anyway; verify before commit.
      grep -q '"TunnelID"' "$dir/credentials.json.tmp" || {
        echo "error: the rebuilt credentials file has no TunnelID." >&2
        rm -f "$dir/credentials.json.tmp"
        return 1
      }
      mv "$dir/credentials.json.tmp" "$dir/credentials.json"
    fi
  fi

  for host in "$fqdn" "${extras[@]}"; do
    cf_dns_point "$host" "$tid" || return 1
  done
  echo "$tid" >"$dir/tunnel-id"
  printf '%s\n' "$fqdn" "${extras[@]}" >"$dir/hostname"
}

# ── the ingress file ─────────────────────────────────────────────────────────
# One rule per hostname, all pointing at the one service, then an explicit 404.
# The catch-all matters: without a final rule cloudflared refuses to start, and
# with a permissive one the tunnel would answer for hostnames it was never given.
#
# All hostnames share the service because the origin is a proxy that dispatches
# on Host itself (caddy here, ingress-nginx for the k3d rig). cloudflared passes
# the requested Host through unchanged, so the far end sees the name the browser
# asked for and routes on it.
cfn_write_config() { # <name> <fqdn> <service-url> [fqdn…]
  local name="$1" fqdn="$2" service="$3" dir tid host
  shift 3
  dir="$(cfn_dir "$name")"
  tid="$(cat "$dir/tunnel-id")"
  {
    cat <<YAML
# GENERATED by .claude/skills/lib/cf-named-tunnel.sh — do not edit by hand.
# Mounted read-only at /etc/cloudflared inside the cloudflared container.
tunnel: $tid
credentials-file: /etc/cloudflared/credentials.json

ingress:
YAML
    for host in "$fqdn" ${1+"$@"}; do
      cat <<YAML
  - hostname: $host
    service: $service
    originRequest:
      # The origin is a plain-HTTP proxy on its rig's docker network; TLS
      # terminates at Cloudflare's edge, and cloudflared is what puts
      # \`X-Forwarded-Proto: https\` on the request the origin receives. Nothing
      # here speaks https, so no verification setting applies — this timeout is
      # the only knob that has bitten us: a cold vite SSR can take ~19s and the
      # default 30s is uncomfortably close.
      connectTimeout: 30s
YAML
    done
    cat <<YAML
  # Anything else reaching this tunnel is not ours. Say so rather than serving it.
  - service: http_status:404
YAML
  } >"$dir/config.yml"
}

# ── the container ────────────────────────────────────────────────────────────
cfn_running() { # <name>
  [ -n "$(docker ps -q -f "name=^$(cfn_container "$1")\$" 2>/dev/null)" ]
}

# The hostname is read back off the RUNNING container's label, not off a state
# file. Same rule as the quick tunnels reading cloudflared's log rather than a
# cached URL: a state file describes what someone intended, a label describes
# what is actually serving.
cfn_url() { # <name>
  local host
  host="$(docker inspect "$(cfn_container "$1")" \
    --format '{{index .Config.Labels "hackagon.tunnel.hostname"}}' 2>/dev/null || true)"
  [ -n "$host" ] || return 1
  echo "https://$host"
}

cfn_stop() { # <name>
  local c
  c="$(cfn_container "$1")"
  if [ -n "$(docker ps -aq -f "name=^$c\$" 2>/dev/null)" ]; then
    docker rm -f "$c" >/dev/null
    echo "    stopped  $c"
  else
    echo "    no container $c"
  fi
}

cfn_run() { # <name> <fqdn> <network> <service-url> [fqdn…]
  local name="$1" fqdn="$2" network="$3" service="$4" c dir_d all
  shift 4
  c="$(cfn_container "$name")"
  dir_d="$(cfn_dir_docker "$name")"
  # Every hostname this container serves, on ONE label. `cfn_url` still reads
  # `hostname` (the primary) so nothing that asks "what is this rig's URL"
  # changes; this one exists so `status` and a teardown can name them all.
  all="$(printf '%s,' "$fqdn" ${1+"$@"})"
  all="${all%,}"

  cfn_write_config "$name" "$fqdn" "$service" ${1+"$@"}

  docker network inspect "$network" >/dev/null 2>&1 || {
    echo "error: docker network '$network' does not exist — is that rig up?" >&2
    return 1
  }

  docker rm -f "$c" >/dev/null 2>&1 || true
  docker run -d --name "$c" \
    --restart unless-stopped \
    --network "$network" \
    --label "hackagon.tunnel.name=$name" \
    --label "hackagon.tunnel.hostname=$fqdn" \
    --label "hackagon.tunnel.hostnames=$all" \
    --label "hackagon.tunnel.service=$service" \
    -v "$dir_d:/etc/cloudflared:ro" \
    "$CFN_IMAGE" \
    tunnel --no-autoupdate --config /etc/cloudflared/config.yml run >/dev/null

  # Two waits, because they fail for different reasons and only one of them is
  # ours to fix. "Registered tunnel connection" is cloudflared reaching the edge
  # — if that never appears the credentials or the network are wrong. The HTTPS
  # probe is the hostname resolving and the origin answering, which additionally
  # needs the DNS record and a live upstream.
  printf "    edge     "
  local i
  for i in $(seq 1 40); do
    if docker logs "$c" 2>&1 | grep -q "Registered tunnel connection"; then
      echo "connected"
      break
    fi
    if [ "$i" = 40 ]; then
      echo "FAILED"
      echo "error: cloudflared never registered a connection. Last lines:" >&2
      docker logs --tail 20 "$c" 2>&1 | sed 's/^/       /' >&2
      return 1
    fi
    sleep 2
  done

  printf "    https    "
  local code=000
  for i in $(seq 1 30); do
    # `|| true`, NOT `|| echo 000`: curl writes %{http_code} — which is `000`
    # on a connection failure — to stdout itself, so the fallback appended a
    # SECOND 000 and the guard below saw the string "000000", which is not
    # "000", so the loop broke on its first attempt and printed a code nobody
    # could read. The probe reported success-shaped output having waited for
    # nothing.
    code="$(cfn_probe "$fqdn")"
    # Anything but a connection failure means the name resolved AND Cloudflare
    # reached the tunnel. A 502 here is the origin's problem, not the tunnel's,
    # and saying so is more useful than waiting for it to become a 200.
    [ "$code" != "000" ] && break
    sleep 2
  done

  if [ "$code" != "000" ]; then
    echo "$code"
    return 0
  fi

  # ── it did not answer. WHICH of the two failures is it? ────────────────────
  #
  # "The tunnel is broken" and "this machine cannot look the name up" produce
  # the same silence and want opposite responses, so ask Cloudflare's own
  # resolver over DoH and retry against the address it gives. If THAT works, the
  # tunnel is fine and the local resolver is the story — which is a real state
  # here, not a hypothetical: the network this was built on answers AAAA-only
  # for these names and has no IPv6 route out, so every lookup succeeds and
  # every connection fails in 9ms.
  local ip
  ip="$(curl -sS --max-time 10 "https://1.1.1.1/dns-query?name=$fqdn&type=A" \
    -H "accept: application/dns-json" 2>/dev/null |
    jqr '[.Answer[]? | select(.type == 1) | .data][0] // empty' 2>/dev/null || true)"
  if [ -n "$ip" ]; then
    code="$(cfn_probe "$fqdn" "$ip")"
    if [ "$code" != "000" ]; then
      echo "$code (only via a pinned IPv4 edge)"
      echo "warn: https://$fqdn WORKS — the tunnel and the DNS record are fine —" >&2
      echo "      but THIS machine's resolver cannot reach it. Most often it is" >&2
      echo "      answering AAAA-only on a network with no IPv6 route out." >&2
      echo "      Anything running here needs the name pinned to $ip;" >&2
      echo "      auth-wire.sh does that inside the dev container automatically." >&2
      return 0
    fi
  fi

  echo "no answer"
  echo "warn: https://$fqdn did not answer, and neither did $ip via a pinned" >&2
  echo "      IPv4 edge. A freshly created record can take a minute; after that," >&2
  echo "      check the origin: docker logs $c" >&2
}

# Fetch <url> and answer with its HTTP code, falling back to a DoH-resolved
# IPv4 edge when this machine's own resolver cannot get there.
#
# For the pre-flight checks in the rigs' wire-frontend.sh scripts, which refuse
# to write a config pointing at something that does not answer — a good rule
# that becomes a wrong ANSWER on a host whose resolver returns AAAA-only for a
# name that is serving perfectly. The check should fail when the TUNNEL is
# broken, not when the caller's DNS is.
#
# Prints the code; prints nothing else, so it can be used in a `$( )`.
cfn_http_code() { # <url>
  local url="$1" host code ip
  host="${url#*://}"
  host="${host%%/*}"
  host="${host%%:*}"
  code="$(cfn_url_probe "$url")"
  [ "$code" != "000" ] && {
    printf '%s' "$code"
    return 0
  }
  ip="$(curl -sS --max-time 10 "https://1.1.1.1/dns-query?name=$host&type=A" \
    -H "accept: application/dns-json" 2>/dev/null |
    jqr '[.Answer[]? | select(.type == 1) | .data][0] // empty' 2>/dev/null || true)"
  [ -n "$ip" ] || {
    printf '000'
    return 0
  }
  cfn_url_probe "$url" "$host" "$ip"
}

cfn_url_probe() { # <url> [host ipv4]
  local out
  if [ -n "${3:-}" ]; then
    out="$(curl -sS -o "$CURL_DISCARD" -w '%{http_code}' --max-time 20 \
      --resolve "$2:443:$3" "$1" 2>/dev/null || true)"
  else
    out="$(curl -sS -o "$CURL_DISCARD" -w '%{http_code}' --max-time 20 "$1" 2>/dev/null || true)"
  fi
  out="${out//[^0-9]/}"
  [ -n "$out" ] || out=000
  printf '%s' "${out: -3}"
}

# One probe attempt. <fqdn> [ipv4] — with an address it pins the connection to
# that edge instead of trusting the local resolver.
cfn_probe() { # -> a 3-digit code, 000 when nothing answered
  local out
  if [ -n "${2:-}" ]; then
    out="$(curl -sS -o "$CURL_DISCARD" -w '%{http_code}' --max-time 10 \
      --resolve "$1:443:$2" "https://$1/" 2>/dev/null || true)"
  else
    out="$(curl -sS -o "$CURL_DISCARD" -w '%{http_code}' --max-time 10 "https://$1/" 2>/dev/null || true)"
  fi
  out="${out//[^0-9]/}"
  [ -n "$out" ] || out=000
  # curl prints its own 000 on failure; keep the LAST three digits so a stray
  # concatenation cannot read as success.
  printf '%s' "${out: -3}"
}

cfn_up() { # <name> <fqdn> <network> <service-url> [fqdn…]
  local name="$1" fqdn="$2" network="$3" service="$4"
  shift 4
  cfn_ensure "$name" "$fqdn" ${1+"$@"} || return 1
  cfn_run "$name" "$fqdn" "$network" "$service" ${1+"$@"}
}

cfn_destroy() { # <name> <fqdn> [fqdn…]
  local name="$1" host
  shift
  cfn_stop "$name"
  cf_load || return 1
  cf_resolve_zone || return 1
  # Every hostname handed in, plus anything the state dir remembers — a record
  # this tooling created and then forgot about is exactly the stranded record
  # `destroy` exists to prevent.
  local -a hosts=("$@")
  if [ -s "$(cfn_dir "$name")/hostname" ]; then
    while IFS= read -r host; do
      [ -n "$host" ] || continue
      case " ${hosts[*]-} " in *" $host "*) continue ;; esac
      hosts+=("$host")
    done <"$(cfn_dir "$name")/hostname"
  fi
  for host in ${hosts[0]+"${hosts[@]}"}; do
    cf_dns_delete "$host" || true
  done
  local tid
  tid="$(cf_tunnel_id "$name")" || return 1
  if [ -n "$tid" ]; then
    cf_tunnel_delete "$tid" && echo "    tunnel   deleted  $name ($tid)"
  else
    echo "    tunnel   absent   $name"
  fi
  rm -rf "$(cfn_dir "$name")"
}

cfn_status() {
  local c host hosts svc
  local found=0
  for c in $(docker ps --format '{{.Names}}' | grep -E '^cf-named-' || true); do
    host="$(docker inspect "$c" --format '{{index .Config.Labels "hackagon.tunnel.hostname"}}' 2>/dev/null || true)"
    hosts="$(docker inspect "$c" --format '{{index .Config.Labels "hackagon.tunnel.hostnames"}}' 2>/dev/null || true)"
    svc="$(docker inspect "$c" --format '{{index .Config.Labels "hackagon.tunnel.service"}}' 2>/dev/null || true)"
    printf '%-28s https://%-45s → %s\n' "$c" "$host" "$svc"
    case "$hosts" in
      "" | "$host") ;;
      *) printf '%-28s   also %s\n' "" "${hosts#"$host",}" ;;
    esac
    found=1
  done
  [ "$found" -eq 1 ] || echo "no named tunnels running"
}

# ── CLI ──────────────────────────────────────────────────────────────────────
# Sourced (BASH_SOURCE differs from $0) it defines functions and stops here.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    up)
      shift
      cfn_up "$@"
      ;;
    ensure)
      shift
      cfn_ensure "$@"
      ;;
    stop)
      shift
      cfn_stop "$@"
      ;;
    status)
      cfn_status
      ;;
    url)
      shift
      cfn_url "$@"
      ;;
    running)
      shift
      cfn_running "$@"
      ;;
    destroy)
      shift
      cfn_destroy "$@"
      ;;
    check)
      cf_load || {
        cf_explain_unconfigured
        exit 1
      }
      cf_verify_token || exit 1
      cf_resolve_zone || exit 1
      echo "credentials ok — zone $CLOUDFLARE_ZONE is active and writable"
      echo "  app         ${HACKAGON_HOSTNAME:-(unset)}"
      echo "  plausible   ${PLAUSIBLE_HOSTNAME:-(unset)}"
      echo "  openreplay  ${OPENREPLAY_HOSTNAME:-(unset)}"
      echo "  k3d app     ${K3D_HOSTNAME:-(unset)}"
      echo "  k3d auth    ${K3D_AUTH_HOSTNAME:-(unset)}"
      ;;
    -h | --help | "")
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown command: $1 (see --help)" >&2
      exit 2
      ;;
  esac
fi
