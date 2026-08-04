import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { resolve } from "$app/paths"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  // Same source as the list: the layout's `hackathon.get` already carries this
  // project, so editing it needs no read of its own.
  const { hackathon, myMembership } = await event.parent()

  const project = hackathon.projects.find((p) => p.id === event.params.projectId)
  if (!project) {
    error(404, "Project not found")
  }

  // The three subjects `ProjectService.Edit` accepts: the proposer, who holds a
  // project-scoped Owner role; the hackathon owner, who holds `project:write`
  // across the hackathon; and an admin, via the casbin escape hatch. Refused up
  // front rather than after a form is filled in — `Edit` decides for real.
  const isCreator = project.creatorId === event.locals.platformUser?.id
  const isHackathonOwner =
    myMembership?.role === HackathonRole.HACKATHON_ROLE_OWNER
  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!isCreator && !isHackathonOwner && !isAdmin) {
    error(403, "Only the person who proposed this project can edit it")
  }

  return {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      trackId: project.trackId,
      image: project.image,
      status: project.status,
    },
    tracks: hackathon.tracks.map((t) => ({ id: t.id, name: t.name })),
    hackathonId: hackathon.id,
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const title = form.get("title")
    const description = form.get("description")
    const trackId = form.get("trackId")
    const image = form.get("image")

    if (typeof title !== "string" || title.trim().length < 3) {
      return fail(400, { message: "Title must be at least 3 characters" })
    }
    if (title.trim().length > 255) {
      return fail(400, { message: "Title must be at most 255 characters" })
    }
    // TODO(backend: project-edit-clear-fields): `EditRequest.description` has
    // `min_len = 1` while `ProposeRequest.description` has no minimum, so a
    // description can be left out at proposal time but never emptied — or even
    // saved as-is — afterwards. Until the minimum is dropped, this is a
    // required field on edit and the message says so. Once it lands, drop this
    // check and pass the empty string through.
    if (typeof description !== "string" || description.trim() === "") {
      return fail(400, {
        message:
          "A description is required — the backend rejects an empty one when editing",
      })
    }
    if (description.length > 10000) {
      return fail(400, {
        message: "Description must be at most 10000 characters",
      })
    }

    try {
      await project.edit({
        projectId: event.params.projectId,
        title: title.trim(),
        description,
        // TODO(backend: project-edit-clear-fields): `Edit` applies `track_id`
        // only when non-empty, so a track can be set and changed but never
        // removed. The form therefore drops "No track" once a track is set,
        // rather than offering a control that silently does nothing. Once the
        // handler distinguishes unset from empty, restore the option here and
        // in the form.
        trackId:
          typeof trackId === "string" && trackId !== "" ? trackId : undefined,
        // Unlike track, an empty image does clear: `Edit` tests `req.Image`
        // for nil, not for "".
        image: typeof image === "string" ? image.trim() : "",
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit this project",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "This project no longer exists" })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/projects/mine`))
  },
}
