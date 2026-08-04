// Single source of truth for "does this top-level URL segment address a
// SitePage?". Used by the [slug=sitepage] param matcher (which decides whether
// the route matches at all) and by hooks.server.ts (which decides whether the
// auth guard lets an anonymous visitor through). If the two ever disagree,
// admins get pages that either 404 or bounce visitors to the login screen.
//
// Slugs are validated the same way the backend validates them (lowercase
// kebab-case), so any page an admin creates in /manage/pages is reachable
// immediately, without a code change per page.

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Top-level segments owned by real routes. A SitePage may never shadow one:
// the router would still prefer the static route, but an admin creating
// "dashboard" would then have an unreachable page and no idea why.
const RESERVED_SLUGS = new Set([
  "dashboard",
  "signin",
  "signout",
  "auth",
  "error",
  "hackathon",
  "manage",
  "my",
  "api",
])

export function isSitePageSlug(segment: string): boolean {
  return SLUG_PATTERN.test(segment) && !RESERVED_SLUGS.has(segment)
}

/** The single path segment of `pathname`, or null if it is not a one-segment path. */
export function singleSegment(pathname: string): string | null {
  const m = /^\/([^/]+)\/?$/.exec(pathname)

  return m ? m[1]! : null
}
