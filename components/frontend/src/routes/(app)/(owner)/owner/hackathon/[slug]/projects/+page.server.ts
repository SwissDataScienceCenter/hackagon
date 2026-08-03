import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import type { Project } from "$lib/server/grpc/generated/hackathon/entities/project"

interface ProjectRow {
  id: string
  title: string
  creatorName: string
  createdAt: Date | undefined
  modifiedAt: Date | undefined
}

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  // Project.creator_id is a bare UUID; the layout's member list is the only
  // place names are available, so resolve them here rather than render ids.
  const userNames = new Map(
    hackathon.members
      .filter((m) => m.user)
      .map((m) => [m.user!.id, m.user!.displayName || m.user!.username]),
  )

  const toRow = (p: Project): ProjectRow => ({
    id: p.id,
    title: p.title,
    creatorName: userNames.get(p.creatorId) ?? "Unknown",
    createdAt: p.createdAt,
    modifiedAt: p.modifiedAt,
  })

  const byCreatorThenOldest = (a: ProjectRow, b: ProjectRow) =>
    a.creatorName.localeCompare(b.creatorName) ||
    (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)

  const approved = hackathon.projects
    .filter((p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED)
    .map(toRow)
    .sort(byCreatorThenOldest)

  // Anything not approved lands here, so the two tabs stay exhaustive and no
  // project can hide between them on an unexpected status value.
  const pending = hackathon.projects
    .filter((p) => p.status !== ProjectStatus.PROJECT_STATUS_APPROVED)
    .map(toRow)
    .sort(byCreatorThenOldest)

  return { hackathonId: event.params.slug, approved, pending }
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
