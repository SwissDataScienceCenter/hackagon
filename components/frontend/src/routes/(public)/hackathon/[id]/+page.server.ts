import { redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async (event) => {
  // Signed-in visitors get the member view of the same hackathon instead of the
  // public marketing page.
  const session = await event.locals.auth()
  if (session?.user) {
    redirect(302, `/my/hackathon/${event.params.id}/overview`)
  }
  return {}
}
