import { error, redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import { publicHackathonClient, publicPageClient } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"

export const load: PageServerLoad = async (event) => {
  // Signed-in visitors get the member view of the same hackathon instead of the
  // public marketing page.
  const session = await event.locals.auth()
  if (session?.user) {
    redirect(302, `/my/hackathon/${event.params.id}/overview`)
  }

  // `Get` still requires membership (audit B2), so the public page is built
  // from `List`, which serves public hackathons to anonymous callers. The
  // shallow entry carries everything shown here: name, dates, status,
  // description and logo.
  const listed = await publicHackathonClient().list({
    visibilityFilter: Visibility.VISIBILITY_PUBLIC,
  })
  const hackathon = listed.hackathons.find((h) => h.id === event.params.id)
  // Private or nonexistent are indistinguishable to an anonymous caller, and
  // should be: revealing that a private event exists is a leak.
  if (!hackathon) error(404, "Hackathon not found")

  // Pages of a public hackathon are public content (winners, wrap-up posts).
  let pages: { id: string; title: string; content: string }[] = []
  try {
    const result = await publicPageClient().list({ hackathonId: event.params.id })
    pages = result.pages.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content ?? "",
    }))
  } catch {
    // Page listing is best-effort — the event page still renders without it.
  }

  return {
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      description: hackathon.description ?? "",
      logo: hackathon.logo ?? "",
      status: hackathon.status,
      startsAt: hackathon.startsAt,
      endsAt: hackathon.endsAt,
    },
    pages,
  }
}
