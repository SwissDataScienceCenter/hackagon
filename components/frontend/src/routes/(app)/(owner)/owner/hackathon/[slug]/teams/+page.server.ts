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

  const teams = result.teams.map((t) => ({
    id: t.id,
    name: t.name,
    projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
    members: t.members.map((m) => ({ id: m.id, name: m.displayName || m.username })),
  }))

  // A participant belongs to at most one team, so anyone not on a team is in the pool.
  const assignedIds = new Set(result.teams.flatMap((t) => t.members.map((m) => m.id)))
  const unassigned = confirmedParticipants.filter((p) => !assignedIds.has(p.id))

  return { hackathonId: event.params.slug, teams, unassigned }
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

  // Moves a participant to `toTeamId`, or unassigns them when it is empty. The
  // backend allows a user on several teams, so the single-team rule is enforced
  // here: every other team membership in this hackathon is removed first.
  move: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const userId = form.get("userId")
    const toTeamId = form.get("toTeamId")
    if (typeof userId !== "string" || userId === "") {
      return fail(400, { message: "Select a participant to move" })
    }
    if (typeof toTeamId !== "string") {
      return fail(400, { message: "Missing target team" })
    }

    try {
      const current = await team.list({ hackathonId: event.params.slug })
      const leaving = current.teams.filter(
        (t) => t.id !== toTeamId && t.members.some((m) => m.id === userId),
      )

      for (const t of leaving) {
        await team.removeUser({ teamId: t.id, userId })
      }
      if (toTeamId !== "") {
        await team.assignUser({ teamId: toTeamId, userId })
      }
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to manage these teams" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team or user not found" })
      }
      throw e
    }

    return { success: true }
  },
}
