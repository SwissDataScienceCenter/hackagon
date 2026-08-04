import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/** Maps a gRPC failure onto a form error, rethrowing anything unexpected. */
function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only the event's organizers can do that." })
    if (e.code === Status.UNAUTHENTICATED)
      return fail(401, { message: "Please sign in again." })
    if (e.code === Status.NOT_FOUND) return fail(404, { message: "That item no longer exists." })
    if (e.code === Status.ALREADY_EXISTS) return fail(409, { message: "That already exists." })
    if (e.code === Status.FAILED_PRECONDITION)
      return fail(409, { message: e.details || "That isn't possible right now." })
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details || "Invalid input." })
  }
  throw e
}

// ProjectStatus: PROPOSED=1, APPROVED=2
const PROJECT_APPROVED = 2

export const load: PageServerLoad = async (event) => {
  const { team, hackathon } = requireGrpc(event.locals.grpc)
  const { hackathon: full } = await event.parent()

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

  // Same probe the cockpit uses: ListInvites needs hackathon write, so it
  // answers "may this caller run the organizer controls" without guessing at
  // roles — a global admin passes it too.
  let isOrganizer = true
  try {
    await hackathon.listInvites({ hackathonId: event.params.id })
  } catch (e) {
    if (
      e instanceof ClientError &&
      (e.code === Status.PERMISSION_DENIED || e.code === Status.UNAUTHENTICATED)
    ) {
      isOrganizer = false
    } else {
      throw e
    }
  }

  const projectTitles = new Map(full.projects.map((p) => [p.id, p.title]))

  return {
    teams: result.teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      projectTitle: projectTitles.get(t.projectId) ?? "",
      members: t.members.map((m) => ({
        id: m.id,
        name: m.displayName || m.username,
      })),
    })),
    // A team hangs off a project, so there is nothing to create a team for
    // until a proposal is approved.
    projects: full.projects
      .filter((p) => p.status === PROJECT_APPROVED)
      .map((p) => ({ id: p.id, title: p.title })),
    participants: full.members
      .filter((m) => !m.isWaiting && m.user)
      .map((m) => ({
        id: m.user?.id ?? "",
        name: m.user?.displayName || m.user?.username || "",
      })),
    isOrganizer,
  }
}

export const actions: Actions = {
  createTeam: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const name = String(form.get("name") ?? "").trim()
    const projectId = String(form.get("projectId") ?? "")
    if (!name) return fail(400, { message: "A team needs a name." })
    if (!projectId) return fail(400, { message: "Pick the project this team works on." })
    try {
      await team.create({
        projectId,
        name,
        description: String(form.get("description") ?? "").trim(),
      })
    } catch (e) {
      return formError(e)
    }

    return { teamCreated: name }
  },

  editTeam: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const id = String(form.get("teamId") ?? "")
    if (!id) return fail(400, { message: "Missing team." })
    try {
      await team.edit({
        id,
        name: String(form.get("name") ?? "").trim() || undefined,
        // Unlike the name, an emptied description is a real edit.
        description: String(form.get("description") ?? ""),
      })
    } catch (e) {
      return formError(e)
    }

    return { teamEdited: id }
  },

  deleteTeam: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const id = String(form.get("teamId") ?? "")
    if (!id) return fail(400, { message: "Missing team." })
    try {
      await team.delete({ id })
    } catch (e) {
      return formError(e)
    }

    return { teamDeleted: id }
  },

  assignUser: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const teamId = String(form.get("teamId") ?? "")
    const userId = String(form.get("userId") ?? "")
    if (!teamId || !userId) return fail(400, { message: "Pick someone to add." })
    try {
      await team.assignUser({ teamId, userId })
    } catch (e) {
      return formError(e)
    }

    return { userAssigned: userId }
  },

  removeUser: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const teamId = String(form.get("teamId") ?? "")
    const userId = String(form.get("userId") ?? "")
    if (!teamId || !userId) return fail(400, { message: "Missing member." })
    try {
      await team.removeUser({ teamId, userId })
    } catch (e) {
      return formError(e)
    }

    return { userRemoved: userId }
  },
}
