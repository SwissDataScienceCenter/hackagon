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

// Segments owned by real routes are derived from the route tree rather than
// listed by hand. The hand-written list was wrong twice in one day: `create`
// (under /hackathon) and `account` were both missing, so hooks.server.ts read
// them as SitePage slugs, treated them as public, and skipped the gRPC setup.
// The (app) guard then found no client and redirected to login, which sent the
// signed-in user straight back — an infinite redirect on a route that exists.
// A derived list cannot drift: adding a route reserves its segment.
//
// Non-eager glob: only the KEYS are used, so this costs a path list, not the
// modules themselves.
//
// `+page.svelte` ONLY, deliberately. The pattern used to include `+page.ts`
// and `+page.server.ts`, and a non-eager glob still puts every match in the
// module graph — so a production build pulled server-only modules into a file
// that client code imports and refused to build at all ("an impossible
// situation occurred"). `vite dev` never resolves the unused branches, which
// is why this worked locally for as long as nobody ran the build.
//
// Nothing is lost: every page a URL can land on has a `+page.svelte`, and the
// two exceptions — endpoint-only routes and the auth paths — are named in
// EXTRA_RESERVED below.
const ROUTE_FILES = import.meta.glob("/src/routes/**/+page.svelte")

function routeOwnedSegments(): Set<string> {
  const owned = new Set<string>()

  for (const path of Object.keys(ROUTE_FILES)) {
    for (const segment of path.slice("/src/routes/".length).split("/")) {
      // A leaf (+page.svelte) directly under routes/ means the route is "/",
      // which owns no named segment.
      if (segment.startsWith("+")) break
      // (group) folders are organisational and contribute nothing to the URL,
      // so the segment that matters is further down.
      if (segment.startsWith("(")) continue
      // [id] / [slug=sitepage] match dynamically — there is no literal to
      // reserve, and [slug=sitepage] is the SitePage route itself.
      if (segment.startsWith("[")) break

      owned.add(segment)
      break
    }
  }

  return owned
}

// Reserved beyond the route tree: paths served by hooks/handlers rather than by
// a +page file, which therefore never show up in the glob above.
const EXTRA_RESERVED = ["auth", "error", "api", "consent"]

const RESERVED_SLUGS = new Set([...routeOwnedSegments(), ...EXTRA_RESERVED])

export function isSitePageSlug(segment: string): boolean {
  return SLUG_PATTERN.test(segment) && !RESERVED_SLUGS.has(segment)
}

/** The single path segment of `pathname`, or null if it is not a one-segment path. */
export function singleSegment(pathname: string): string | null {
  const m = /^\/([^/]+)\/?$/.exec(pathname)

  return m ? m[1]! : null
}

/** Exposed for the unit test that pins the derivation against the real tree. */
export const reservedSlugs = RESERVED_SLUGS
