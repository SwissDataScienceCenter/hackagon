import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { phase } = requireGrpc(event.locals.grpc)

  let result
  try {
    result = await phase.get({ phaseId: event.params.phaseId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Phase not found")
    }
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to edit this phase")
    }
    throw e
  }

  if (!result.phase) {
    error(404, "Phase not found")
  }

  return { phase: result.phase }
}

export const actions: Actions = {
  create: async (event) => {
    const { page, phase } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const title = form.get("title")
    const content = form.get("content")
    const visible = form.get("visible")

    if (typeof title !== "string" || title.trim().length < 1) {
      return fail(400, { message: "Title is required" })
    }
    if (visible !== "visible" && visible !== "hidden") {
      return fail(400, { message: "Visibility is required" })
    }

    let created
    try {
      created = await page.create({
        hackathonId: event.params.slug,
        title,
        content: typeof content === "string" ? content : "",
        visible: visible === "visible",
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to create pages",
        })
      }
      throw e
    }

    try {
      await phase.edit({
        phaseId: event.params.phaseId,
        pageId: created.pageId,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, {
          message: `Page created, but linking it failed: ${e.details}`,
        })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "Page created, but you don't have permission to link it",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, {
          message: "Page created, but the phase was not found",
        })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/timeline`)
  },
}
