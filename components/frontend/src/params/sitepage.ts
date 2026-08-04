import type { ParamMatcher } from "@sveltejs/kit"

// Only these top-level slugs resolve to platform pages. Without a matcher a
// bare [slug] route would swallow every unmatched URL — including typos of
// real routes, which should still 404 rather than hit the backend.
//
// Add a slug here when an admin publishes a new platform page that needs a
// top-level URL.
const SITE_PAGE_SLUGS = new Set(["about", "privacy", "terms"])

export const match: ParamMatcher = (param) => SITE_PAGE_SLUGS.has(param)
