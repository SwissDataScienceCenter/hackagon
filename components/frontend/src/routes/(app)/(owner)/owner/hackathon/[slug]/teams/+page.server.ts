import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { team } = requireGrpc(event.locals.grpc)
  const { hackathon } = await event.parent()

  const result = await team.list({ hackathonId: event.params.slug })

  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  const confirmedParticipants = hackathon.members
    .filter((m) => !m.isWaiting && m.user)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
    }))

  const teams = result.teams.map((t) => {
    const memberIds = new Set(t.members.map((m) => m.id))
    return {
      id: t.id,
      name: t.name,
      projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
      members: t.members.map((m) => ({ id: m.id, name: m.displayName || m.username })),
      available: confirmedParticipants.filter((p) => !memberIds.has(p.id)),
    }
  })

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

  assign: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const teamId = form.get("teamId")
    const userId = form.get("userId")
    if (typeof teamId !== "string" || teamId === "") {
      return fail(400, { message: "Missing team id" })
    }
    if (typeof userId !== "string" || userId === "") {
      return fail(400, { message: "Select a participant to add" })
    }

    try {
      await team.assignUser({ teamId, userId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to manage this team" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team or user not found" })
      }
      throw e
    }

    return { success: true }
  },

  removeMember: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const teamId = form.get("teamId")
    const userId = form.get("userId")
    if (typeof teamId !== "string" || teamId === "") {
      return fail(400, { message: "Missing team id" })
    }
    if (typeof userId !== "string" || userId === "") {
      return fail(400, { message: "Missing user id" })
    }

    try {
      await team.removeUser({ teamId, userId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to manage this team" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team or user not found" })
      }
      throw e
    }

    return { success: true }
  },
}
