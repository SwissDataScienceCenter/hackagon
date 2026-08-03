import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import { projectStatusLabel } from "$lib/utils/projectStatus"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  const projects = hackathon.projects.map((p) => ({
    id: p.id,
    title: p.title,
    statusLabel: projectStatusLabel(p.status) ?? "Unknown",
  }))

  return { projects }
}

export const actions: Actions = {
  create: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const projectId = form.get("projectId")
    const name = form.get("name")
    const description = form.get("description")

    if (typeof projectId !== "string" || projectId === "") {
      return fail(400, { message: "Please select a project" })
    }
    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Name must be at least 3 characters" })
    }
    if (typeof description !== "string") {
      return fail(400, { message: "Invalid description" })
    }

    try {
      await team.create({ projectId, name, description })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to create teams",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Project not found" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/teams`)
  },
}
