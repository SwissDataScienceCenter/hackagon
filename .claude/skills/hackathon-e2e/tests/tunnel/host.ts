/**
 * The public host these specs are pointed at, and the URL patterns built from
 * it.
 *
 * WHY THIS IS NOT A LITERAL. Both tunnel specs used to wait for
 * `/trycloudflare\.com\/realms\/hackagon/`, which is the QUICK tunnel's domain.
 * That was fine while a quick tunnel was the only public path there was, and it
 * silently became a lie the moment a NAMED tunnel on our own zone became the
 * default: every one of those waits would time out on a hostname that is
 * working perfectly, and the failure reads as "login is broken through the
 * tunnel" — the exact conclusion these specs exist to make trustworthy.
 *
 * Derive the pattern from TUNNEL_BASE_URL instead. It says the same thing the
 * literal said — "the flow must stay on the public host, never dead-end on
 * localhost:8180" — for whichever public host is actually in use.
 */

/** e.g. `hackagon.example.org` or `x-y-z.trycloudflare.com`. */
export function tunnelHost(base: string | undefined): string {
  if (!base) return ""
  try {
    return new URL(base).host
  } catch {
    return ""
  }
}

/** Escape a hostname for use inside a RegExp — dots are the whole point. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Matches any URL on the public host. Used to assert the browser came BACK to
 * the app after Keycloak, which is where a wrong `ORIGIN` or a wrong issuer
 * dead-ends.
 */
export function onTunnel(base: string | undefined): RegExp {
  return new RegExp(esc(tunnelHost(base)))
}

/**
 * Matches Keycloak's login page served from the SAME public host — caddy
 * path-multiplexes `/realms/*` to it. This is the step that used to dead-end on
 * `localhost:8180` when the issuer rewiring was not in effect, and it is the
 * one assertion that distinguishes a login-capable tunnel from a view-only one.
 */
export function onTunnelRealm(base: string | undefined): RegExp {
  return new RegExp(`${esc(tunnelHost(base))}/realms/hackagon`)
}
