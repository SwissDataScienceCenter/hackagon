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

export const load: LayoutServerLoad = async (event) => {
  const proto =
    firstHeaderValue(event.request.headers.get("x-forwarded-proto")) ??
    event.url.protocol.replace(":", "")
  const host =
    firstHeaderValue(event.request.headers.get("x-forwarded-host")) ?? event.url.host

  return {
    session: event.locals.session,
    publicOrigin: `${proto}://${host}`,
  }
}
