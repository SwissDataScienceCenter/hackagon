import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { phase, page } = requireGrpc(event.locals.grpc)

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

  const pagesResult = await page.list({ hackathonId: event.params.slug })

  return { phase: result.phase, pages: pagesResult.pages }
}

export const actions: Actions = {
  edit: async (event) => {
    const { phase } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const name = form.get("name")
    const description = form.get("description")
    const startsAt = form.get("startsAt")
    const endsAt = form.get("endsAt")
    const pageId = form.get("pageId")

    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Name must be at least 3 characters" })
    }
    if (typeof description !== "string" || description.trim().length < 1) {
      return fail(400, { message: "Description is required" })
    }
    const hasStartsAt = typeof startsAt === "string" && startsAt !== ""
    const hasEndsAt = typeof endsAt === "string" && endsAt !== ""
    if (hasStartsAt !== hasEndsAt) {
      return fail(400, {
        message: "Both starts at and ends at must be set together",
      })
    }

    try {
      await phase.edit({
        phaseId: event.params.phaseId,
        name,
        description,
        startsAt: hasStartsAt ? new Date(startsAt) : undefined,
        endsAt: hasEndsAt ? new Date(endsAt as string) : undefined,
        pageId: typeof pageId === "string" ? pageId : undefined,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit this phase",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Phase not found" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/timeline`)
  },

  delete: async (event) => {
    const { phase } = requireGrpc(event.locals.grpc)

    try {
      await phase.delete({ phaseId: event.params.phaseId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to delete this phase",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Phase not found" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/timeline`)
  },
}
