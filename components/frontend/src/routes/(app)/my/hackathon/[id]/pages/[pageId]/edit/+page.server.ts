import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePages } from "$lib/server/hackathon/capabilities"
import { parsePageForm } from "$lib/server/hackathon/pageForm"
import { resolve } from "$app/paths"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { page } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManagePages(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can edit pages")
  }

  // Fetched rather than picked out of the layout's `hackathon.get`, even though
  // that response nests the pages: after a save this page reloads, and the
  // layout's copy can still be the pre-edit tree. Asking PageService means the
  // form always shows what was actually stored.
  let result
  try {
    result = await page.get({ pageId: event.params.pageId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "This page is not available")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Page not found")
    }
    throw e
  }

  if (!result.page) {
    error(404, "Page not found")
  }

  // A page id from another hackathon would otherwise render inside this
  // hackathon's shell, under its nav and header — and `Edit` would then happily
  // write to it, since it takes the hackathon from the page rather than the URL.
  if (result.page.hackathonId !== event.params.id) {
    error(404, "Page not found")
  }

  return {
    hackathonId: hackathon.id,
    page: {
      id: result.page.id,
      title: result.page.title,
      content: result.page.content,
      visible: result.page.visible,
    },
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)

    const parsed = parsePageForm(await event.request.formData())
    if (!parsed.ok) {
      return fail(400, { message: parsed.message })
    }
    const values = parsed.values

    try {
      await page.edit({
        pageId: event.params.pageId,
        title: values.title,
        content: values.content,
        visible: values.visible,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit this page",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: e.details })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/pages`))
  },

  delete: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)

    try {
      await page.delete({ pageId: event.params.pageId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to delete this page",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Page not found" })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/pages`))
  },
}
