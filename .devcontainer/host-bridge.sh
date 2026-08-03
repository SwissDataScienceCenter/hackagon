#!/usr/bin/env bash
# Bridge loopback-bound dev services to the container's network interface so
# Docker's published ports reach them from the host WITHOUT devcontainer
# tooling. VS Code / the devcontainer CLI forward loopback ports themselves —
# this script is only needed for plain `docker compose` usage.
#
# Why: docker-proxy targets the container's eth0 IP, but inside the container
# Vite listens on [::1]:8081 and Postgres on 127.0.0.1:5432 only. The backend
# (3000) binds all interfaces and needs no bridge. Keycloak (8180) binds
# 0.0.0.0 and needs no bridge.
#
# Idempotent — re-running replaces existing bridges.
set -euo pipefail

export USER="${USER:-$(whoami)}"
[ -e "$HOME/.nix-profile/etc/profile.d/nix.sh" ] && . "$HOME/.nix-profile/etc/profile.d/nix.sh"

ip=$(hostname -i | awk '{print $1}')
listen="TCP-LISTEN" # split so pkill below never matches this script's cmdline

bridge() {
    local port="$1" target="$2"
    pkill -f "socat ${listen}:${port}," 2>/dev/null || true
    sleep 0.2
    setsid nohup socat "${listen}:${port},bind=${ip},fork,reuseaddr" "${target}" \
        >"/tmp/socat-${port}.log" 2>&1 &
    echo "bridging ${ip}:${port} -> ${target}"
}

bridge 8081 "TCP6:[::1]:8081"    # frontend (vite binds IPv6 loopback)
bridge 5432 "TCP:127.0.0.1:5432" # postgres
