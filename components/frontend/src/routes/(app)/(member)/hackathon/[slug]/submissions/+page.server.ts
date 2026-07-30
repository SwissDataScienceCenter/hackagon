import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const result = await team.list({ hackathonId: event.params.slug })
  const myTeam = result.teams.find((t) => t.members.some((m) => m.id === platformUserId))

  if (!myTeam) {
    return { slug: event.params.slug, team: null, project: undefined, submissions: [] }
  }

  const { team: fullTeam } = await team.get({ teamId: myTeam.id })
  const project = hackathon.projects.find((p) => p.id === myTeam.projectId)

  return {
    slug: event.params.slug,
    team: fullTeam ?? myTeam,
    project,
    submissions: fullTeam?.submissions ?? [],
  }
}
