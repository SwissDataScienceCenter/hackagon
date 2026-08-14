#!/usr/bin/env bash
# Put a pinned k3d, helm and kubectl in the skill's own gitignored bin/.
#
#   bash scripts/tools.sh          # install what is missing
#   bash scripts/tools.sh --force  # re-download everything
#
# Why download rather than run them in containers:
#
#   k3d    talks to the Docker socket and writes a kubeconfig. In a container
#          it needs the socket bind-mounted AND a shared path for the
#          kubeconfig, and on Docker Desktop for Windows the socket path has to
#          be spelled `//var/run/docker.sock` to survive MSYS mangling. One
#          25 MB static binary removes all of that.
#   helm   the previous attempt at this used `docker run alpine/helm`, which
#          works but has to reach the apiserver: the published API port is on
#          the HOST's loopback, which is not the container's, so it would need
#          `--network k3d-<cluster>` plus a rewritten server URL. Same
#          conclusion.
#   kubectl a Windows kubectl may already be on PATH (Docker Desktop ships one).
#          It is still installed here, pinned, so the rig does not depend on
#          which version happens to be installed.
#
# A container fallback is documented in SKILL.md for a machine where fetching
# binaries is not allowed.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

mkdir -p "$BIN_DIR"

case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) OS=windows; EXT=.exe ;;
    Darwin)               OS=darwin;  EXT=  ;;
    *)                    OS=linux;   EXT=  ;;
esac
case "$(uname -m)" in
    x86_64|amd64) ARCH=amd64 ;;
    arm64|aarch64) ARCH=arm64 ;;
    *) die "unsupported architecture $(uname -m)" ;;
esac

fetch() { # name url
    local name="$1" url="$2" dest="$BIN_DIR/$1$EXT"
    if [ -x "$dest" ] && [ "$FORCE" -eq 0 ]; then
        ok "$name already present ($("$dest" version --short 2>/dev/null | head -1 || echo present))"
        return
    fi
    step "fetching $name"
    curl -fsSL --retry 3 -o "$dest.part" "$url" || die "download failed: $url"
    mv "$dest.part" "$dest"
    chmod +x "$dest"
    ok "$name -> $dest"
}

fetch k3d "https://github.com/k3d-io/k3d/releases/download/$K3D_VERSION/k3d-$OS-$ARCH$EXT"

if [ ! -x "$BIN_DIR/helm$EXT" ] || [ "$FORCE" -eq 1 ]; then
    step "fetching helm $HELM_VERSION"
    tmp="$STATE_DIR/helm-dl"
    rm -rf "$tmp"; mkdir -p "$tmp"
    if [ "$OS" = windows ]; then
        curl -fsSL --retry 3 -o "$tmp/helm.zip" \
            "https://get.helm.sh/helm-$HELM_VERSION-windows-$ARCH.zip" || die "helm download failed"
        (cd "$tmp" && unzip -q helm.zip)
        mv "$tmp/windows-$ARCH/helm.exe" "$BIN_DIR/helm.exe"
    else
        curl -fsSL --retry 3 -o "$tmp/helm.tgz" \
            "https://get.helm.sh/helm-$HELM_VERSION-$OS-$ARCH.tar.gz" || die "helm download failed"
        (cd "$tmp" && tar xzf helm.tgz)
        mv "$tmp/$OS-$ARCH/helm" "$BIN_DIR/helm"
        chmod +x "$BIN_DIR/helm"
    fi
    rm -rf "$tmp"
    ok "helm -> $BIN_DIR/helm$EXT"
else
    ok "helm already present"
fi

fetch kubectl "https://dl.k8s.io/release/$KUBECTL_VERSION/bin/$OS/$ARCH/kubectl$EXT"

step "versions"
"$BIN_DIR/k3d$EXT" version | sed 's/^/  /' >&2
"$BIN_DIR/helm$EXT" version --short | sed 's/^/  helm /' >&2
"$BIN_DIR/kubectl$EXT" version --client=true -o yaml 2>/dev/null \
    | awk '/gitVersion/{print "  kubectl " $2; exit}' >&2 || true
