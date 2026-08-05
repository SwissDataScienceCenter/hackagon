import type { PageServerLoad } from "./$types"
import { publicSitePageClient } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// One route serves every platform page (about, privacy, terms, …): the slug is
// the primary key on the backend, so new pages an admin creates are reachable
// immediately without a deploy. The param matcher keeps this from swallowing
// other top-level routes.
export const load: PageServerLoad = async (event) => {
  // A client instance, not a factory: main's client.ts creates the
  // unauthenticated clients once at module load rather than per call.
  try {
    const result = await publicSitePageClient.get({ slug: event.params.slug })
    if (!result.sitePage) error(404, "Page not found")

    return { page: result.sitePage }
  } catch (e) {
    // Unpublished pages are reported as NOT_FOUND by the backend, so drafts
    // look exactly like missing pages to visitors.
    if (e instanceof ClientError && e.code === Status.NOT_FOUND)
      error(404, "Page not found")
    throw e
  }
}
