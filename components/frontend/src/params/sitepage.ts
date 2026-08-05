import type { ParamMatcher } from "@sveltejs/kit"
import { isSitePageSlug } from "$lib/utils/sitePageSlug"

// Any lowercase-kebab segment that is not a reserved route can address a
// SitePage, so pages created in /manage/pages resolve without a deploy. The
// matcher still exists so multi-segment and malformed URLs never reach the
// loader. Unknown slugs 404 from the loader itself (the backend reports
// NotFound), which is what a visitor should see for a typo.
export const match: ParamMatcher = (param) => isSitePageSlug(param)
