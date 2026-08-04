import { redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import { publicPageClient } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  // Signed-in visitors get the member view of the same hackathon instead of the
  // public marketing page.
  const session = await event.locals.auth()
  if (session?.user) {
    redirect(302, `/my/hackathon/${event.params.id}/overview`)
  }

  // Pages of a public hackathon are public content (winners, wrap-up posts).
  // Private hackathons yield an empty list here — the backend refuses.
  let pages: { id: string; title: string; content: string }[] = []
  try {
    const result = await publicPageClient().list({
      hackathonId: event.params.id,
    })
    pages = result.pages.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content ?? "",
    }))
  } catch {
    // Not public or not found — the marketing shell still renders.
  }

  return { pages }
}
