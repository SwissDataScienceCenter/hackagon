import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { team } = requireGrpc(event.locals.grpc)
  const { hackathon } = await event.parent()

  let result
  try {
    result = await team.get({ teamId: event.params.teamId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to view this team")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Team not found")
    }
    throw e
  }

  if (!result.team) {
    error(404, "Team not found")
  }

  const project = hackathon.projects.find((p) => p.id === result.team!.projectId)

  return { slug: event.params.slug, team: result.team, project }
}
