// Where a login goes, and where it comes back to.
//
// The auth guards (hooks.server.ts, (app)/+layout.server.ts) park the requested
// URL in a `returnTo` query parameter when they bounce an anonymous visitor to
// the sign-in interstitial. Anything that ends up in a redirect target has to be
// validated first: only same-origin absolute paths are allowed, so the login
// flow cannot be abused as an open redirect.

/** The interstitial an anonymous visitor is bounced to. Public by definition. */
export const LOGIN_PATH = "/signin"

/**
 * Where a login lands when the visitor did not arrive by deep link. The
 * dashboard, not "/": landing on the page you started from reads as "nothing
 * happened", and the platform's own front page is not what someone who just
 * signed in came for.
 */
export const DEFAULT_LOGIN_DESTINATION = "/dashboard"

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null
  // Must be a path, not an absolute URL ("https://evil.example").
  if (!value.startsWith("/")) return null
  // "//evil.example" and "/\evil.example" are read as protocol-relative URLs.
  if (value.startsWith("//") || value.startsWith("/\\")) return null

  return value
}

/**
 * The interstitial URL for a visitor who tried to open `target`.
 *
 * `target` is validated on the way IN as well as on the way out: a guard builds
 * it from `event.url`, but the invite flow builds it from a path of its own, and
 * a helper that only validates at the end leaves the bad value visible in the
 * address bar in the meantime.
 */
export function loginUrlFor(target: string | null | undefined): string {
  const safe = safeReturnTo(target)

  return safe ? `${LOGIN_PATH}?returnTo=${encodeURIComponent(safe)}` : LOGIN_PATH
}

/**
 * Where a completed login should land: the validated deep link the visitor was
 * reaching for, else the dashboard.
 *
 * This is the ONE branch that decides between "back to where you were going"
 * and "the dashboard", so a change that breaks one cannot silently pass the
 * other — both the guard's round trip and the plain "Log in" button call it.
 */
export function loginDestination(
  returnTo: string | null | undefined,
): string {
  const target = safeReturnTo(returnTo)
  if (!target) return DEFAULT_LOGIN_DESTINATION

  // The interstitial is never a destination. Returning to it after a successful
  // login would either bounce the visitor onward again or park them on a page
  // whose entire purpose is to leave — and a crafted
  // `?returnTo=/signin?returnTo=…` would nest that as deep as someone cared to
  // type.
  if (target === LOGIN_PATH || target.startsWith(`${LOGIN_PATH}?`))
    return DEFAULT_LOGIN_DESTINATION
  if (target.startsWith(`${LOGIN_PATH}/`)) return DEFAULT_LOGIN_DESTINATION

  return target
}
