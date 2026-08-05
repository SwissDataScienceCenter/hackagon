import type { LayoutServerLoad } from "./$types"

// The origin a VISITOR reaches the app at, for the absolute URLs in link
// previews (og:url, og:image, canonical).
//
// `event.url` is the origin the app was reached at internally. Behind a
// TLS-terminating proxy — the Cloudflare tunnel here, an ingress in
// production — that is plain http, so og:image would advertise an insecure URL
// that crawlers refuse to fetch, and og:url would name an internal host.
//
// The proxy states the truth in X-Forwarded-*. adapter-node can be told to
// trust those globally with PROTOCOL_HEADER/HOST_HEADER, but the dev server
// cannot, and the quick-tunnel hostname changes on every restart — so it is
// read per request rather than baked into config.
//
// A comma-separated value means the request crossed several proxies; the first
// entry is the client-facing one.
function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined
}

/**
 * Is this a local address, where plain http is the honest answer?
 *
 * Everything else is assumed to be reached over https. That inference exists
 * because the dev tunnel deliberately does NOT forward X-Forwarded-Proto to
 * this app: Auth.js derives its cookie names from the scheme it sees, and
 * feeding it https on some requests and http on others silently broke login
 * (see .devcontainer/Caddyfile.tunnel). So the scheme is inferred here, where
 * it only affects the absolute URLs in link previews, instead of being
 * injected upstream where it also reaches the session layer.
 */
function isLocalHost(host: string): boolean {
  const name = host.split(":")[0] ?? ""

  return name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name === "::1"
}

export const load: LayoutServerLoad = async (event) => {
  const host =
    firstHeaderValue(event.request.headers.get("x-forwarded-host")) ?? event.url.host

  // A non-local hostname is served over https, full stop — a public URL on
  // plain http is not a deployment this app supports.
  //
  // The forwarded proto is NOT consulted for that decision: caddy reports its
  // own inbound hop, which is plain http from cloudflared even though the
  // visitor is on https, so trusting it would advertise insecure preview URLs.
  // Locally there is no proxy and the request scheme is the truth.
  const proto = isLocalHost(host)
    ? (firstHeaderValue(event.request.headers.get("x-forwarded-proto")) ??
      event.url.protocol.replace(":", ""))
    : "https"

  return {
    session: event.locals.session,
    publicOrigin: `${proto}://${host}`,
  }
}
