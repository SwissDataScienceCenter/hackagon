import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  const projects = hackathon.projects.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    trackName: p.trackId ? (trackNames.get(p.trackId) ?? "Unknown track") : null,
  }))

  return { hackathonId: event.params.slug, projects }
}

export const actions: Actions = {
  approve: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const projectId = form.get("projectId")
    if (typeof projectId !== "string" || projectId === "") {
      return fail(400, { message: "Missing project id" })
    }

    try {
      await project.approve({ projectId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to approve this project" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Project not found" })
      }
      throw e
    }

    return { success: true }
  },

  disapprove: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const projectId = form.get("projectId")
    if (typeof projectId !== "string" || projectId === "") {
      return fail(400, { message: "Missing project id" })
    }

    try {
      await project.disapprove({ projectId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to update this project" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Project not found" })
      }
      throw e
    }

    return { success: true }
  },
}
