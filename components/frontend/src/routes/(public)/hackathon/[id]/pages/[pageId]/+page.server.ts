import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"

/**
 * No backend call: the layout's single `GetHackathon` already carries every
 * published page *with its content*, so this picks one out rather than fetching
 * it again.
 *
 * That also means an unpublished page cannot be reached by guessing its id —
 * not because this checks, but because a page the organisers have hidden was
 * never in the response to begin with. The backend filters on `visible`, and
 * this route can only ever see what it was given.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  const page = hackathon.pages.find((p) => p.id === event.params.pageId)
  if (!page) error(404, "Page not found")

  return { page }
}
