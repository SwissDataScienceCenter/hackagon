import type { PageServerLoad } from "./$types"
import { error } from "@sveltejs/kit"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  const project = hackathon.projects.find(
    (p) => p.id === event.params.projectId,
  )
  if (!project) {
    error(404, "Proposal not found")
  }

  const track = hackathon.tracks.find((t) => t.id === project.trackId) ?? null

  return { slug: event.params.slug, project, trackName: track?.name ?? null }
}
