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

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManagePages(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can add pages")
  }

  return { hackathonId: hackathon.id }
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
      await page.create({
        hackathonId: event.params.id,
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
          message: "You don't have permission to add pages here",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: e.details })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/pages`))
  },
}
