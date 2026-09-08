import type { PageServerLoad } from "./$types"
import { error } from "@sveltejs/kit"
import { publicPageClient } from "$lib/server/grpc/client"
import { ClientError, Status } from "nice-grpc-common"

/**
 * One published page of a public hackathon.
 *
 * Fetched rather than taken from the layout's list, which carries titles only —
 * deliberately, since it is loaded on every route in the subtree and page
 * content is the one thing that does not belong on all of them.
 *
 * Every refusal becomes 404, including PERMISSION_DENIED. On the member route
 * the honest answer is 403 ("this page is not available to you"), because the
 * reader is a known participant being told about a page they can see the
 * existence of. Here the reader is the internet, and 403 would confirm that a
 * hidden page with that id exists — so a page an organiser has not published is
 * indistinguishable from one that was never created.
 */
export const load: PageServerLoad = async (event) => {
  let result
  try {
    result = await publicPageClient().get({ pageId: event.params.pageId })
  } catch (e) {
    if (
      e instanceof ClientError &&
      (e.code === Status.PERMISSION_DENIED || e.code === Status.NOT_FOUND)
    ) {
      error(404, "Page not found")
    }
    throw e
  }

  if (!result.page) {
    error(404, "Page not found")
  }

  // A page id from another hackathon would otherwise render inside this
  // hackathon's hero and tab strip, under its name.
  if (result.page.hackathonId !== event.params.id) {
    error(404, "Page not found")
  }

  return {
    page: {
      id: result.page.id,
      title: result.page.title,
      content: result.page.content,
    },
  }
}
