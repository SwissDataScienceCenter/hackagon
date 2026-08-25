import { error, redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import { publicHackathonClient } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"

export const load: PageServerLoad = async (event) => {
  // Signed-in visitors get the member view of the same hackathon instead of the
  // public page. Only the signed-out view is built for now.
  const session = await event.locals.auth()
  if (session?.user) {
    redirect(302, `/my/hackathon/${event.params.id}/overview`)
  }

  // `list` filtered to public, not `get`. Both are readable anonymously for a
  // public hackathon, but `get` also returns the member roster, and an about
  // page has no business handing that to the internet. `list` carries
  // everything this page renders — name, description, dates, status.
  //
  // It takes no id filter, so the match happens here.
  const { hackathons } = await publicHackathonClient().list({
    visibilityFilter: Visibility.VISIBILITY_PUBLIC,
  })
  const hackathon = hackathons.find((h) => h.id === event.params.id)

  // One answer for "no such hackathon" and for "private": a private hackathon
  // is not something an anonymous visitor should be able to detect. Its own
  // unlisted landing page needs a backend that will serve it to a stranger
  // holding the link, which is a separate piece of work.
  if (!hackathon) error(404, "Hackathon not found")

  return {
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      description: hackathon.description ?? "",
      startsAt: hackathon.startsAt,
      endsAt: hackathon.endsAt,
      status: hackathon.status,
    },
  }
}
