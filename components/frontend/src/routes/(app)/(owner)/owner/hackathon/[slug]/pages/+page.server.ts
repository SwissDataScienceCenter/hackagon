import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { page } = requireGrpc(event.locals.grpc)

  const result = await page.list({ hackathonId: event.params.slug })

  return { hackathonId: event.params.slug, pages: result.pages }
}

export const actions: Actions = {
  delete: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const pageId = form.get("pageId")
    if (typeof pageId !== "string" || pageId === "") {
      return fail(400, { message: "Missing page id" })
    }

    try {
      await page.delete({ pageId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to delete this page" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Page not found" })
      }
      throw e
    }

    return { success: true }
  },
}
