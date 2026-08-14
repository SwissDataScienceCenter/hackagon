/*
 * What the analytics tracker is allowed to say about "which page".
 *
 * THE URL IS NEVER SENT. Plausible's script defaults to `location.href`, and
 * this app's URLs carry things that must not end up in an analytics database:
 *
 *   /invite/<token>              the token IS the credential — hooks.server.ts
 *                                makes that route public precisely because the
 *                                URL authenticates the visitor
 *   /my/hackathon/<uuid>/…       the id of an event that may be private
 *   /register/<uuid>             which event a person is signing up to
 *   ?…                           query strings, which nothing here needs
 *
 * This is the same rule session replay had to be argued into
 * (`SessionReplay.svelte`: `resourceBaseHref`, `urlSanitizer`, and the
 * `document.URL` shadow). It is settled the same way and one step earlier:
 * rather than sanitizing a URL, we never build one from the address bar.
 *
 * WHAT IS SENT INSTEAD IS THE ROUTE ID — SvelteKit's own template for the
 * matched route, e.g. `/my/hackathon/[id]/teams`. That is structurally
 * incapable of carrying an id, because the string never comes from the
 * location: it comes from the route tree at build time. A regex scrubber over
 * the real path would have been the obvious alternative and is strictly worse —
 * it has to ENUMERATE what secrets look like, so a route added later leaks
 * until somebody remembers to extend the pattern, which is exactly how
 * per-field masking opt-in fails in the replay tracker.
 *
 * The cost, stated plainly: Plausible can tell you that the teams screen was
 * viewed 40 times and can never tell you for which hackathon. Per-event
 * breakdowns would mean putting event ids in an aggregate store, which is the
 * thing being avoided. Product questions of the form "which SCREENS do people
 * use" are answered; "what happened at event X" is not, and that is what the
 * backend's own data is for.
 */

/**
 * SvelteKit route id → the path reported to analytics.
 *
 * `page.route.id` looks like `/(app)/my/hackathon/[id]/teams`. Two
 * normalisations, both cosmetic and both about not leaking the SHAPE of the
 * codebase into a dashboard people read:
 *
 *  - layout GROUPS (`(app)`, `(public)`) are removed — they are a source-tree
 *    concern and are not part of any URL a visitor ever sees;
 *  - param MATCHERS are dropped (`[slug=sitepage]` → `[slug]`), so renaming a
 *    matcher does not fork one page into two rows in the report.
 *
 * `null` — which is what SvelteKit reports for a 404 or an error page, i.e.
 * for a request that matched no route at all — becomes `/[unmatched]`. NOT the
 * real path: an unmatched URL is the single most likely place for a mistyped
 * or hand-edited token to appear, and it is a row worth having in the report
 * (a spike of them means something links somewhere that does not exist).
 */
export function analyticsPath(routeId: string | null | undefined): string {
  if (!routeId) return "/[unmatched]"

  const path = routeId
    .split("/")
    .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")))
    .map((seg) => seg.replace(/^\[([^\]=]+)=[^\]]*\]$/, "[$1]"))
    .join("/")

  return path === "" ? "/" : path
}

/** Absolute URL for the tracker's `u`: this origin, plus the route template. */
export function analyticsUrl(
  origin: string,
  routeId: string | null | undefined,
): string {
  return `${origin.replace(/\/$/, "")}${analyticsPath(routeId)}`
}

/**
 * What the tracker may say about where a visitor came FROM.
 *
 * Plausible's script reads `document.referrer` itself — there is no option for
 * it — so the value is shadowed around the call (see PlausibleAnalytics.svelte)
 * and this decides what to shadow it with:
 *
 *   same origin   → "" . An internal referrer is one of OUR paths, so it
 *                   carries exactly the ids the rest of this file exists to
 *                   keep out. Plausible discards same-site referrers when
 *                   computing sources anyway, so nothing is lost but the leak.
 *   other origin  → its ORIGIN, no path, no query. That is the whole of the
 *                   acquisition-source signal ("came from GitHub") and none of
 *                   the private part ("came from this Slack search URL").
 *   unparseable   → "".
 *
 * Campaign parameters (utm_*) are therefore never recorded, because they live
 * in a query string this never sends. Deliberate: a hackathon platform's
 * traffic is links from partners and chat, not ad campaigns.
 */
export function analyticsReferrer(referrer: string, origin: string): string {
  if (!referrer) return ""
  try {
    const url = new URL(referrer)
    return url.origin === origin ? "" : url.origin
  } catch {
    return ""
  }
}
