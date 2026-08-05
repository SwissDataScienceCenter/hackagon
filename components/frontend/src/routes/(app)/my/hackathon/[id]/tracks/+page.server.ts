import type { PageServerLoad } from "./$types"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageTracks } from "$lib/server/hackathon/capabilities"
import { error } from "@sveltejs/kit"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the
  // tracks, same source the propose form and the overview counts use.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageTracks(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can manage tracks")
  }

  return {
    hackathonId: hackathon.id,
    tracks: hackathon.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
    })),
  }
}
