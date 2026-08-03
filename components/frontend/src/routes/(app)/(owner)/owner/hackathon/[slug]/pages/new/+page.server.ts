import type { Actions } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const actions: Actions = {
  create: async (event) => {
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
      await page.create({
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

    redirect(303, `/owner/hackathon/${event.params.slug}/pages`)
  },
}
