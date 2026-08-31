// Where a login bounce meant to send somebody.
//
// `hooks.server.ts:55` and `(app)/+layout.server.ts:18` both answer a protected
// route with `/?returnTo=<path>` when there is no session. Until this existed
// nothing read that parameter — `hooks.guard.test.ts` says so outright — and the
// landing page's Log in named `page.url.pathname` as its callback, which on that
// very page is `/`. So every deep link into the app was swallowed and everybody
// arrived at the dashboard instead, whatever they had asked for.
//
// The value is attacker-controllable: it is a query parameter on a public page,
// and it ends up as a post-login redirect target. That is the textbook open
// redirect — send somebody a link to our own domain and land them on yours,
// wearing our login as credibility. So it is validated here, once, rather than
// at each caller. Auth.js's own `redirect` callback also refuses a cross-origin
// `callbackUrl`; this is the layer that does not depend on it.

/**
 * The path a login should return to, or `undefined` when there is nothing usable.
 *
 * Only a same-site absolute path qualifies:
 *
 *   - `/dashboard`, `/register/abc?x=1` — kept.
 *   - `//evil.example`, `/\evil.example` — rejected. A protocol-relative URL is a
 *     foreign origin wearing a path's clothes, and browsers read the backslash
 *     form the same way.
 *   - `https://evil.example`, `javascript:alert(1)` — rejected: not a path.
 *   - `dashboard` — rejected. A path with no leading slash resolves against
 *     wherever the visitor happens to be, so it does not name one place.
 *
 * Takes what `searchParams.get` returns, `null` included, so a caller needs no
 * check of its own.
 */
export function safeReturnTo(
  param: string | null | undefined,
): string | undefined {
  if (!param) return undefined

  // Deliberately no decoding step. The bounce writes `encodeURIComponent`, and
  // `searchParams.get` has already undone exactly that — decoding again here is
  // what would let `%252F%252Fevil.example` through this check as a harmless
  // string and then be read as `//evil.example` by whoever navigates it.
  if (!param.startsWith("/")) return undefined
  if (param.startsWith("//") || param.startsWith("/\\")) return undefined

  return param
}
