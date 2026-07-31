import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async (event) => {
  // `hackathon.get` already eager-loads tracks in the layout, so there is
  // nothing to fetch here.
  const { hackathon } = await event.parent()

  const tracks = hackathon.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }))

  return { tracks }
}
