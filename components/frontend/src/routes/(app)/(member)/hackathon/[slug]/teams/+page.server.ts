import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)

  const result = await team.list({ hackathonId: event.params.slug })
  const projectTitleById = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  const teams = result.teams.map((t, i) => {
    const projectTitle = projectTitleById.get(t.projectId)
    return {
      num: i + 1,
      id: t.id,
      title: t.name,
      projectDescription: t.description || `Project: ${projectTitle ?? "unknown"}`,
      members: t.members.map((m) => ({ name: m.displayName || m.username })),
    }
  })

  return { teams, slug: event.params.slug }
}
