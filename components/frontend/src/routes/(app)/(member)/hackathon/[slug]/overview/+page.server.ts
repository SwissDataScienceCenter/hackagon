import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { projectStatusLabel } from "$lib/utils/projectStatus"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser!.id

  const result = await team.list({ hackathonId: event.params.slug })
  const myTeam = result.teams.find((t) => t.members.some((m) => m.id === platformUserId))

  if (!myTeam) {
    return { myTeam: null }
  }

  const project = hackathon.projects.find((p) => p.id === myTeam.projectId)
  const track = project ? hackathon.tracks.find((t) => t.id === project.trackId) : undefined

  return {
    myTeam: {
      id: myTeam.id,
      name: myTeam.name,
      memberCount: myTeam.members.length,
      projectName: project?.title ?? "Unknown project",
      projectTrack: track?.name ?? "No track",
      projectStatus: project ? (projectStatusLabel(project.status) ?? "Unknown") : "Unknown",
    },
  }
}
