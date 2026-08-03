import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { page } = requireGrpc(event.locals.grpc)

  let result
  try {
    result = await page.get({ pageId: event.params.pageId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Page not found")
    }
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to edit this page")
    }
    throw e
  }

  if (!result.page) {
    error(404, "Page not found")
  }

  return { page: result.page }
}

export const actions: Actions = {
  edit: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)
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

    try {
      await page.edit({
        pageId: event.params.pageId,
        title,
        content: typeof content === "string" ? content : undefined,
        visible: visible === "visible",
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to edit this page" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Page not found" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/pages`)
  },

  delete: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)

    try {
      await page.delete({ pageId: event.params.pageId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to delete this page" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Page not found" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/pages`)
  },
}
