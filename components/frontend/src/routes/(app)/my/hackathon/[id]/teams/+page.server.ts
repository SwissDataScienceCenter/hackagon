import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { team } = requireGrpc(event.locals.grpc)
  const { hackathon } = await event.parent()

  let result
  try {
    result = await team.list({ hackathonId: event.params.id })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "Access denied")
    if (e instanceof ClientError && e.code === Status.NOT_FOUND)
      error(404, "Hackathon not found")
    throw e
  }

  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  return {
    teams: result.teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      projectTitle: projectTitles.get(t.projectId) ?? "",
      members: t.members.map((m) => m.displayName || m.username),
    })),
  }
}
