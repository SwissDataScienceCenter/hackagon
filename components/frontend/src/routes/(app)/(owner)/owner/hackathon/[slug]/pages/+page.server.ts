import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { page, phase } = requireGrpc(event.locals.grpc)

  const [pageResult, phaseResult] = await Promise.all([
    page.list({ hackathonId: event.params.slug }),
    phase.list({ hackathonId: event.params.slug }),
  ])

  const phaseNames = new Map(phaseResult.phases.map((p) => [p.id, p.name]))

  const pages = pageResult.pages.map((p) => ({
    id: p.id,
    title: p.title,
    visible: p.visible,
    order: p.order,
    phaseId: p.phaseId,
    phaseName: p.phaseId ? phaseNames.get(p.phaseId) : undefined,
  }))

  return { hackathonId: event.params.slug, pages }
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
