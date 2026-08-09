import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// Platform-page administration. The backend requires the global Admin role for
// every mutation and for listing drafts, so this route only translates its
// verdicts — it never decides access itself.

/** Maps a gRPC failure onto a form error, rethrowing anything unexpected. */
function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, {
        message: "Only platform admins can manage these pages.",
      })
    if (e.code === Status.UNAUTHENTICATED)
      return fail(401, { message: "Please sign in again." })
    if (e.code === Status.NOT_FOUND)
      return fail(404, { message: "That page no longer exists." })
    if (e.code === Status.ALREADY_EXISTS)
      return fail(409, { message: "A page with that slug already exists." })
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, {
        message:
          "Invalid page: the slug must be lowercase words joined by dashes, and the title cannot be empty.",
      })
  }
  throw e
}

export const load: PageServerLoad = async (event) => {
  const { sitePage } = requireGrpc(event.locals.grpc)

  try {
    // Admins manage drafts too, so ask for everything.
    const result = await sitePage.list({ includeHidden: true })

    return { pages: result.sitePages }
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "Access denied")
    if (e instanceof ClientError && e.code === Status.UNAUTHENTICATED)
      error(401, "Authentication required")
    throw e
  }
}

export const actions: Actions = {
  create: async (event) => {
    const { sitePage } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const slug = String(form.get("slug") ?? "").trim()
    const title = String(form.get("title") ?? "").trim()
    if (!slug || !title)
      return fail(400, { message: "Slug and title are required." })

    try {
      await sitePage.create({
        slug,
        title,
        content: String(form.get("content") ?? ""),
        visible: form.get("visible") === "on",
        order: Number(form.get("order") ?? 0) || 0,
      })
    } catch (e) {
      return formError(e)
    }

    return { created: slug }
  },

  edit: async (event) => {
    const { sitePage } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const slug = String(form.get("slug") ?? "")
    if (!slug) return fail(400, { message: "Missing page slug." })

    try {
      await sitePage.edit({
        slug,
        title: String(form.get("title") ?? ""),
        content: String(form.get("content") ?? ""),
        // An unchecked checkbox submits nothing, so absence means "unpublish".
        visible: form.get("visible") === "on",
        order: Number(form.get("order") ?? 0) || 0,
      })
    } catch (e) {
      return formError(e)
    }

    return { edited: slug }
  },

  delete: async (event) => {
    const { sitePage } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const slug = String(form.get("slug") ?? "")
    if (!slug) return fail(400, { message: "Missing page slug." })

    try {
      await sitePage.delete({ slug })
    } catch (e) {
      return formError(e)
    }

    return { deleted: slug }
  },
}
