import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { team } = requireGrpc(event.locals.grpc)
  const { hackathon } = await event.parent()

  const result = await team.list({ hackathonId: event.params.slug })

  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  const teams = result.teams.map((t) => ({
    id: t.id,
    name: t.name,
    projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
    memberCount: t.members.length,
  }))

  return { hackathonId: event.params.slug, teams }
}

export const actions: Actions = {
  delete: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const teamId = form.get("teamId")
    if (typeof teamId !== "string" || teamId === "") {
      return fail(400, { message: "Missing team id" })
    }

    try {
      await team.delete({ id: teamId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to delete this team" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team not found" })
      }
      throw e
    }

    return { success: true }
  },
}
