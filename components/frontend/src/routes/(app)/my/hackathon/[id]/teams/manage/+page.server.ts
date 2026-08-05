import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { team, project } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const isHackathonOwner =
    myMembership?.role === HackathonRole.HACKATHON_ROLE_OWNER

  // Frontend-only gate, same as the projects page's `mayReview` — the RPCs
  // below enforce it for real, this just decides whether to render the page.
  if (!isHackathonOwner && !isAdmin) {
    error(403, "You don't have permission to manage teams here")
  }

  const { teams } = await team.list({ hackathonId: event.params.id })

  const rows = teams.map((t) => ({
    id: t.id,
    name: t.name,
    projectId: t.projectId,
    members: t.members.map((m) => ({
      id: m.id,
      name: m.displayName || m.username,
    })),
  }))

  // A participant belongs to at most one team, so anyone confirmed and not on
  // a team is in the pool.
  const assignedIds = new Set(teams.flatMap((t) => t.members.map((m) => m.id)))
  const unassigned = hackathon.members
    .filter((m) => !m.isWaiting && m.user && !assignedIds.has(m.user.id))
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
    }))

  // Who prefers what, per project — same `Project:Write` permission this page
  // is already gated on, so no separate check is needed here.
  const { projects: preferences } = await project.exportPreferences({
    hackathonId: event.params.id,
  })

  const teamCountByProject = new Map<string, number>()
  for (const t of teams) {
    teamCountByProject.set(
      t.projectId,
      (teamCountByProject.get(t.projectId) ?? 0) + 1,
    )
  }

  const approvedProjects = preferences
    .filter((p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED)
    .map((p) => ({
      id: p.id,
      title: p.title,
      preferredNames: p.preferences.map((u) => u.displayName || u.username),
      teamCount: teamCountByProject.get(p.id) ?? 0,
    }))

  return {
    hackathonId: event.params.id,
    teams: rows,
    unassigned,
    approvedProjects,
  }
}

export const actions: Actions = {
  createTeam: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const projectId = form.get("projectId")
    const name = form.get("name")
    if (typeof projectId !== "string" || projectId === "") {
      return fail(400, { message: "Missing project" })
    }
    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Team name must be at least 3 characters" })
    }

    try {
      await team.create({ projectId, name, description: "" })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to create teams here",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Project not found" })
      }
      throw e
    }

    return { success: true }
  },

  // Moves a participant to `toTeamId`, or unassigns them when it is empty. The
  // backend allows a user on several teams, so the single-team rule is
  // enforced here: every other team membership in this hackathon is removed
  // first.
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
      const current = await team.list({ hackathonId: event.params.id })
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
        return fail(403, {
          message: "You don't have permission to manage these teams",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team or participant not found" })
      }
      throw e
    }

    return { success: true }
  },
}
