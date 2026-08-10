#!/usr/bin/env bash
# Edit `config.local.yaml` ONE TOP-LEVEL KEY AT A TIME.
#
#   config-overlay.sh set    <file> <key>   # full block on stdin, first line `<key>:`
#   config-overlay.sh get    <file> <key>   # that block on stdout (empty if absent)
#   config-overlay.sh remove <file> <key>
#   config-overlay.sh has    <file> <key>   # exit 0 when present
#   config-overlay.sh keys   <file>         # one top-level key per line
#
# `get` round-trips into `set`, which is what lets a caller borrow a key for
# the duration of something and hand it back untouched.
#
# `set` and `remove` print `changed` or `unchanged` on stdout, so a caller can
# restart a server only when it actually has to. `remove` deletes the FILE when
# it takes the last key with it, which is what keeps an unwired machine looking
# exactly like a fresh clone.
#
# WHY THIS IS NOT JUST AN `rm`.
#
# config.local.yaml is the gitignored overlay both loaders read after (and
# merge over) the tracked config.yaml — components/frontend/src/lib/server/
# settings.ts and components/backend/internal/config/config.go. It exists so
# machine-specific wiring never dirties a tracked file, after a Cloudflare
# tunnel hostname that dies in a few hours sat committed for several commits.
#
# It now has MORE THAN ONE WRITER, and they are unaware of each other:
#
#   oidc:    .claude/skills/cloudflare-tunnel/scripts/auth-wire.sh
#   replay:  .claude/skills/openreplay-stack/scripts/wire-frontend.sh
#
# Each owns exactly one top-level key. If either treated "unwire me" as
# "delete the overlay", it would silently take the other's wiring with it —
# and the failure is invisible in both directions: unwiring the tunnel would
# stop session replay recording (an empty OpenReplay UI, which already looks
# like the correct default), and unwiring replay would drop the tunnel's
# issuer, so the public URL keeps serving pages and only LOGIN breaks. That
# second one is not hypothetical: `hackathon-e2e/scripts/run.sh` calls
# `auth-wire.sh --restore` on the way into EVERY suite run.
#
# So: keys are added and removed independently, and the file disappears only
# when nothing is left in it.
#
# FILE FORMAT, which is this script's alone — nothing hand-edits the overlay:
#   * a leading run of comments/blank lines is the HEADER, owned here and
#     rewritten on every write;
#   * a top-level key starts at column 0 and its block runs to the next
#     column-0 key or EOF;
#   * comments INSIDE a block must be indented, or they read as the start of
#     the next block. Both writers indent theirs.
set -euo pipefail

HEADER='# GENERATED — machine-local config overlay. Do not edit, do not commit
# (it is gitignored). Deep-merged over config.yaml by the loader, then
# validated by the same schema, so this is not a way in for an invalid config.
#
# Each top-level key below is owned by ONE tool and is added and removed
# independently. Do not delete this file to "turn something off": that takes
# the other tools'"'"' wiring with it.
#
#   oidc:    .claude/skills/cloudflare-tunnel/scripts/auth-wire.sh [--restore]
#   replay:  .claude/skills/openreplay-stack/scripts/wire-frontend.sh [--restore]'

usage() {
  sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

# Everything except the header and the named key's block.
strip_key() { # <file> <key>
  [ -f "$1" ] || return 0
  awk -v key="$2" '
    # Header: comments and blanks before the first top-level key.
    !started && /^[[:space:]]*(#.*)?$/ { next }
    /^[A-Za-z_][A-Za-z0-9_-]*:/ { started = 1; inblock = (index($0, key ":") == 1) }
    !started { next }
    inblock { next }
    { print }
  ' "$1"
}

trim_blank_lines() { # stdin -> stdout, leading/trailing blank lines removed
  awk '
    { line[n++] = $0 }
    END {
      s = 0; while (s < n && line[s] ~ /^[[:space:]]*$/) s++
      e = n - 1; while (e >= s && line[e] ~ /^[[:space:]]*$/) e--
      for (i = s; i <= e; i++) print line[i]
    }
  '
}

# Just the named key's block, as it currently stands.
extract_key() { # <file> <key>
  [ -f "$1" ] || return 0
  awk -v key="$2" '
    /^[A-Za-z_][A-Za-z0-9_-]*:/ { inblock = (index($0, key ":") == 1) }
    inblock { print }
  ' "$1"
}

has_key() { # <file> <key>
  [ -f "$1" ] || return 1
  awk -v key="$2" '
    /^[A-Za-z_][A-Za-z0-9_-]*:/ && index($0, key ":") == 1 { found = 1 }
    END { exit found ? 0 : 1 }
  ' "$1"
}

# Replace <file> with <tmp> only when the bytes differ. The answer is the
# caller's cue to restart a server, and "restart anyway, it is idempotent" is
# not free here: a needless bounce of :8081 mid-suite fails one unrelated test
# and nothing in the output points back.
#
# Compared as strings rather than with `cmp`: this runs both on a Git Bash host
# and inside the Nix dev shell, and diffutils is not guaranteed on the latter's
# PATH. The overlay is generated text that always ends in exactly one newline,
# so the trailing-newline stripping that `$(cat …)` does applies to both sides.
commit() { # <tmp> <file>
  if [ -f "$2" ] && [ "$(cat "$1")" = "$(cat "$2")" ]; then
    rm -f "$1"
    echo "unchanged"
  else
    mv "$1" "$2"
    echo "changed"
  fi
}

cmd="${1:-}"
[ $# -ge 2 ] || usage
file="$2"
key="${3:-}"

case "$cmd" in
  set)
    [ -n "$key" ] || usage
    block="$(cat | trim_blank_lines)"
    # A block that does not start with the key it claims to be would land in
    # the file under someone else's name and be removable by nobody.
    case "$block" in
      "$key:"* | "$key: "*) ;;
      *)
        echo "config-overlay: block for '$key' must start with '$key:'" >&2
        exit 2
        ;;
    esac
    # An identical block is a no-op, and saying so matters more than it looks:
    # a rewrite would move the key to the END of the file, which changes the
    # bytes, which tells the caller to restart a server for nothing. Wiring
    # scripts bounce :8081, and a needless bounce mid-suite fails one unrelated
    # test with nothing pointing back here.
    if [ "$(extract_key "$file" "$key" | trim_blank_lines)" = "$block" ]; then
      echo "unchanged"
      exit 0
    fi
    rest="$(strip_key "$file" "$key" | trim_blank_lines)"
    tmp="$file.tmp.$$"
    {
      printf '%s\n' "$HEADER"
      if [ -n "$rest" ]; then printf '\n%s\n' "$rest"; fi
      printf '\n%s\n' "$block"
    } >"$tmp"
    commit "$tmp" "$file"
    ;;

  remove)
    [ -n "$key" ] || usage
    if [ ! -f "$file" ]; then
      echo "unchanged"
      exit 0
    fi
    rest="$(strip_key "$file" "$key" | trim_blank_lines)"
    if [ -z "$rest" ]; then
      # Nothing but the header would be left. An empty overlay and no overlay
      # are the same configuration, and only one of them looks like a fresh
      # clone to whoever opens the directory next.
      if has_key "$file" "$key"; then
        rm -f "$file"
        echo "changed"
      else
        rm -f "$file"
        echo "unchanged"
      fi
      exit 0
    fi
    tmp="$file.tmp.$$"
    {
      printf '%s\n' "$HEADER"
      printf '\n%s\n' "$rest"
    } >"$tmp"
    commit "$tmp" "$file"
    ;;

  get)
    [ -n "$key" ] || usage
    extract_key "$file" "$key" | trim_blank_lines
    ;;

  has) has_key "$file" "$key" ;;

  keys)
    [ -f "$file" ] || exit 0
    awk '/^[A-Za-z_][A-Za-z0-9_-]*:/ { sub(/:.*/, ""); print }' "$file"
    ;;

  *) usage ;;
esac
