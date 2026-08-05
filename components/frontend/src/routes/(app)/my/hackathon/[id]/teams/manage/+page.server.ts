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

  // Who prefers what, per project — same `Project:Write` permission this page
  // is already gated on, so no separate check is needed here.
  const { projects: preferences } = await project.exportPreferences({
    hackathonId: event.params.id,
  })

  // Inverted: which project(s) a given user prefers, shown on their chip
  // rather than on the project row.
  const preferredTitlesByUser = new Map<string, string[]>()
  for (const p of preferences) {
    for (const u of p.preferences) {
      const titles = preferredTitlesByUser.get(u.id) ?? []
      titles.push(p.title)
      preferredTitlesByUser.set(u.id, titles)
    }
  }

  const toPerson = (id: string, name: string) => ({
    id,
    name,
    preferredTitles: preferredTitlesByUser.get(id) ?? [],
  })

  const teamsById = teams.map((t) => ({
    id: t.id,
    name: t.name,
    projectId: t.projectId,
    members: t.members.map((m) => toPerson(m.id, m.displayName || m.username)),
  }))

  // A participant belongs to at most one team, so anyone confirmed and not on
  // a team is in the pool.
  const assignedIds = new Set(teams.flatMap((t) => t.members.map((m) => m.id)))
  const unassigned = hackathon.members
    .filter((m) => !m.isWaiting && m.user && !assignedIds.has(m.user.id))
    .map((m) => toPerson(m.user!.id, m.user!.displayName || m.user!.username))

  const teamsByProject = new Map<string, typeof teamsById>()
  for (const t of teamsById) {
    const list = teamsByProject.get(t.projectId) ?? []
    list.push(t)
    teamsByProject.set(t.projectId, list)
  }

  // One row per approved project, so its team(s) can be created and staffed
  // here. A project that already has a team but isn't approved (edge case:
  // seed data has one) still gets a row — otherwise that team would have no
  // drop zone anywhere on this page — tagged so it doesn't read as a mistake.
  const projectRows = preferences
    .filter(
      (p) =>
        p.status === ProjectStatus.PROJECT_STATUS_APPROVED ||
        teamsByProject.has(p.id),
    )
    .map((p) => ({
      id: p.id,
      title: p.title,
      isApproved: p.status === ProjectStatus.PROJECT_STATUS_APPROVED,
      teams: teamsByProject.get(p.id) ?? [],
    }))

  return {
    hackathonId: event.params.id,
    unassigned,
    projectRows,
  }
}

export const actions: Actions = {
  createTeam: async (event) => {
    // No `parent()` here — actions get a plain `RequestEvent`, not a load
    // event — so the project lookup this needs re-fetches via `hackathon.get`.
    const { team, hackathon: hackathonClient } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const projectId = form.get("projectId")
    if (typeof projectId !== "string" || projectId === "") {
      return fail(400, { message: "Missing project" })
    }

    const { hackathon } = await hackathonClient.get({
      hackathonId: event.params.id,
    })
    const proj = hackathon?.projects.find((p) => p.id === projectId)
    if (!hackathon || !proj) {
      return fail(404, { message: "Project not found" })
    }
    const base = `Team ${initialsOf(proj.title)}`

    const { teams: existing } = await team.list({
      hackathonId: event.params.id,
    })
    const teamCount = existing.filter((t) => t.projectId === projectId).length
    const name = teamCount === 0 ? base : `${base} ${teamCount + 1}`

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

  renameTeam: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const teamId = form.get("teamId")
    const name = form.get("name")
    if (typeof teamId !== "string" || teamId === "") {
      return fail(400, { message: "Missing team" })
    }
    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Team name must be at least 3 characters" })
    }

    try {
      await team.edit({ id: teamId, name })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to rename this team",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team not found" })
      }
      throw e
    }

    return { success: true }
  },

  deleteTeam: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const teamId = form.get("teamId")
    if (typeof teamId !== "string" || teamId === "") {
      return fail(400, { message: "Missing team" })
    }

    try {
      await team.delete({ id: teamId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to delete this team",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team not found" })
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

/** "AutoML Pipeline Builder" -> "APB". */
function initialsOf(text: string): string {
  return (
    text
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  )
}
