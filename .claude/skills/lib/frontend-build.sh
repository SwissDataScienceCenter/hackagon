#!/usr/bin/env bash
# THE ONE WRITER of components/frontend/build/service.
#
#   frontend-build.sh build       # build, unconditionally
#   frontend-build.sh if-stale    # build only if src/ moved under the last build
#   frontend-build.sh stale       # exit 0 when a build is needed (no build)
#
# WHY THIS EXISTS.
#
# `pnpm build` in components/frontend is `vite build -m production`, and
# svelte.config.js sends adapter-node's output to
# `${QUITSH_BUILD_DIR:-build}/service`. Nothing in that chain is atomic and
# nothing in it is exclusive, so two builds running at once write the same tree
# — and vite also shares `.svelte-kit/output` between them. Observed
# 2026-08-13, three agents driving the harness concurrently:
#
#   Unexpected end of JSON input          (a half-written manifest read back)
#   Cannot find module '…/build/service/server/index.js'   (at server boot)
#
# There were TWO independent callers before this file existed, both writing
# `build/service` with no coordination whatsoever:
#
#   hackathon-e2e/scripts/prod-frontend.sh   serves that tree on :8081
#   cloudflare-tunnel/scripts/prod-serve.sh  serves the SAME tree on :8082
#
# so the two servers do not merely race to build it, they race to build it out
# from under each other while serving it.
#
# The fix is both halves, because they close different holes:
#
#   1. an exclusive LOCK, so two builds cannot interleave, and so the second
#      caller waits and then discovers the first caller's fresh output instead
#      of redoing it (staleness is re-checked INSIDE the lock — checking it
#      outside is how both callers decide to build);
#
#   2. an atomic SWAP, so `build/service` only ever contains a COMPLETE tree.
#      A build is minutes long on the 9p mount and gets interrupted (Ctrl-C, a
#      container recreate, a suite timeout); without this, whatever it had
#      written so far stays there looking like a build, and the next server to
#      boot dies on a missing or truncated file. The lock alone cannot help
#      with that — the writer is gone, not concurrent.
#
# Callers should not have to know any of this, which is why staleness lives here
# too rather than being reimplemented per caller.
set -euo pipefail
trap 'echo "frontend-build.sh: aborted at line $LINENO (status $?)" >&2' ERR

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HERE/../../.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/components/frontend"
OUT_PARENT="$FRONTEND_DIR/build"
OUT="$OUT_PARENT/service"
ENTRY="$OUT/index.js"
RUN_DIR="$ROOT_DIR/.output/run"
LOCK="$RUN_DIR/frontend-build.lock"
BUILD_LOG="$RUN_DIR/frontend-build.log"
# Long, because the thing being waited for is a full production build of this app
# on a 9p bind mount. Measured 2026-08-13: ~2 min warm. A caller that gives up
# early is a caller that builds concurrently, which is the bug.
LOCK_WAIT="${FRONTEND_BUILD_LOCK_WAIT:-900}"

mkdir -p "$RUN_DIR"

# True when src/ (or the build's own inputs) moved since the last build. Same
# rule prod-frontend.sh used to carry inline; a stale build is worse than no
# build, because a suite then reports green against yesterday's frontend.
stale() {
    [ -f "$ENTRY" ] || return 0
    local newer
    newer="$(cd "$FRONTEND_DIR" &&
        find src static package.json pnpm-lock.yaml svelte.config.js vite.config.ts \
            -newer "$ENTRY" -print -quit 2>/dev/null || true)"
    [ -n "$newer" ]
}

# Build into a private directory, then move it into place.
#
# QUITSH_BUILD_DIR is read by svelte.config.js (`out = $QUITSH_BUILD_DIR/service`),
# so the temp tree needs no config change — and it stays inside `build/`, which
# is gitignored, so an interrupted build cannot dirty the worktree either. That
# matters more here than it looks: a dirty worktree is what makes every
# `nix develop` in this repo re-fetch and re-hash the tree under a global lock.
build_locked() {
    local tmp="$OUT_PARENT/.build-$$"
    # Sweep any temp trees a KILLED build left behind. Safe here and only here: we
    # hold the lock, so no live build owns one. Without this they accumulate — the
    # whole point of building elsewhere is that an interrupted build leaves its mess
    # somewhere nothing reads, but somewhere is still on disk.
    rm -rf "$OUT_PARENT"/.build-* "$OUT_PARENT"/.service-old-*
    mkdir -p "$tmp"

    echo "==> Building the frontend (exclusive; log: $BUILD_LOG)..."
    if ! (cd "$FRONTEND_DIR" && QUITSH_BUILD_DIR="$tmp" pnpm build) >"$BUILD_LOG" 2>&1; then
        echo "error: pnpm build failed — see $BUILD_LOG" >&2
        tail -30 "$BUILD_LOG" >&2
        rm -rf "$tmp"
        return 1
    fi
    # Check the tree BEFORE swapping it in, and check the file that actually went
    # missing. "vite exited 0" and "the server can boot" are different claims — the
    # reported failure was `Cannot find module …/build/service/server/index.js`, at
    # boot, from a build that had reported success. Nothing incomplete gets to
    # replace a working tree.
    local f
    for f in index.js handler.js server/index.js; do
        if [ ! -f "$tmp/service/$f" ]; then
            echo "error: build reported success but $tmp/service/$f is missing —" >&2
            echo "       refusing to swap it over the working build. See $BUILD_LOG." >&2
            rm -rf "$tmp"
            return 1
        fi
    done

    # Two renames on one filesystem, old tree out of the way first, so the window
    # in which `build/service` does not exist is a single rename long. Callers
    # start their server after this function returns, so nothing reads it during
    # the swap.
    #
    # RETRIED, because `build/` is on the 9p bind mount and a directory rename
    # there intermittently answers EPERM:
    #
    #   mv: cannot move '…/build/service' to '…/build/.service-old-352884':
    #       Permission denied
    #
    # Observed 2026-08-13 mid-run and NOT reproducible a minute later with the same
    # processes running and no open descriptors anywhere under the tree — so it is
    # the filesystem, not a lock we could take or a handle we could close. An
    # abort here is safe (the working tree is untouched) but it fails a build for a
    # reason that clears itself, which is its own kind of flake.
    local old="$OUT_PARENT/.service-old-$$" i
    rm -rf "$old"
    for i in 1 2 3 4 5; do
        [ -d "$OUT" ] || break
        mv "$OUT" "$old" 2>/dev/null && break
        sleep 2
    done
    if [ -d "$OUT" ]; then
        echo "error: could not move $OUT aside after 5 attempts (9p EPERM — see above)." >&2
        echo "       The existing build is untouched; the new one is in $tmp." >&2
        return 1
    fi
    # If THIS one fails the tree would be missing entirely, which is the exact
    # state this whole file exists to prevent — put the old one back.
    if ! mv "$tmp/service" "$OUT"; then
        if [ -d "$old" ]; then mv "$old" "$OUT"; fi
        echo "error: could not move the new build into place; restored the previous one." >&2
        return 1
    fi
    rm -rf "$old" "$tmp"
    echo "  built"
}

case "${1:-if-stale}" in
stale)
    # No lock: a read-only question, and the answer is only ever used to decide
    # whether to CALL this script, which locks properly. `exit`, not a bare
    # `stale`, so "not stale" is an ANSWER rather than an aborted script — the
    # ERR trap above would otherwise print a scary line for the normal case.
    if stale; then exit 0; else exit 1; fi
    ;;
build)
    flock -w "$LOCK_WAIT" 9 || {
        echo "error: another frontend build held the lock for ${LOCK_WAIT}s" >&2
        exit 1
    }
    build_locked
    ;;
if-stale)
    flock -w "$LOCK_WAIT" 9 || {
        echo "error: another frontend build held the lock for ${LOCK_WAIT}s" >&2
        exit 1
    }
    # INSIDE the lock. Whoever waited here was very likely waiting for exactly
    # the build it wanted; re-asking is what turns N concurrent builds into one.
    if stale; then
        build_locked
    else
        echo "==> The frontend build is current — nothing to do."
    fi
    ;;
*)
    echo "usage: frontend-build.sh [build|if-stale|stale]" >&2
    exit 2
    ;;
esac 9>"$LOCK"
