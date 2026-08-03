import type { PageServerLoad } from "./$types"
import { error } from "@sveltejs/kit"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  const page = hackathon.pages.find(
    (p) => p.id === event.params.pageId && p.visible,
  )
  if (!page) {
    error(404, "Page not found")
  }

  return { page }
}
