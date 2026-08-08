import type { LayoutServerLoad } from "./$types"
import {
  REPLAY_CONSENT_COOKIE,
  parseReplayConsent,
} from "$lib/utils/replayConsent"

// The origin a VISITOR reaches the app at, for the absolute URLs in link
// previews (og:url, og:image, canonical).
//
// `event.url` is the origin the app was reached at internally. Behind a
// TLS-terminating proxy — the Cloudflare tunnel in dev, an ingress in
// production — that is plain http, so og:image would advertise an insecure URL
// that crawlers refuse to fetch, and og:url would name an internal host.
//
// A comma-separated value means the request crossed several proxies; the first
// entry is the client-facing one.
function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined
}

/** Local addresses, where plain http is the honest answer. */
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
  // The forwarded proto is NOT consulted for that decision: the dev tunnel's
  // caddy reports its own inbound hop, which is plain http from cloudflared
  // even though the visitor is on https. Trusting it would advertise insecure
  // preview URLs. (It is also deliberately not forwarded to this app at all —
  // Auth.js derives its cookie NAMES from the scheme it sees, and feeding it
  // https on some requests and http on others silently broke login.)
  const proto = isLocalHost(host)
    ? (firstHeaderValue(event.request.headers.get("x-forwarded-proto")) ??
      event.url.protocol.replace(":", ""))
    : "https"

  // Session replay, if it has been switched on deliberately AND this visitor
  // has said yes. It is mounted on the ROOT layout because a dead control is
  // just as dead on a public page as on a signed-in one.
  //
  // TWO INDEPENDENT SWITCHES, and both must be on:
  //
  //   configured  a deployment filled in `replay:` in config.yaml. Absent or
  //               incomplete ⇒ the feature does not exist here, and nobody is
  //               asked anything.
  //   consent     THIS browser answered "allow". Absent ⇒ no decision has been
  //               made yet, which behaves exactly like "no".
  //
  // The gate is HERE, on the server, and not in the component — that is the
  // whole point. A client-side check would mean the browser had already been
  // handed an ingest endpoint and a project key and was trusted not to use
  // them; withholding them makes "no consent ⇒ no recording" a property of
  // what was sent rather than of what the page decided to do. It is therefore
  // true on the very first paint of the very first page, before any script of
  // ours has run.
  const replay = event.locals.config?.replay
  const configured = Boolean(
    replay?.enabled && replay.ingestPoint && replay.projectKey,
  )
  const consent = parseReplayConsent(event.cookies.get(REPLAY_CONSENT_COOKIE))

  return {
    session: event.locals.session,
    publicOrigin: `${proto}://${host}`,
    replay: {
      configured,
      consent,
      config:
        configured && consent === "granted"
          ? {
              ingestPoint: replay!.ingestPoint!,
              projectKey: replay!.projectKey!,
              allowInsecureOrigin: replay!.allowInsecureOrigin,
            }
          : null,
    },
  }
}
