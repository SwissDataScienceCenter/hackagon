import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { phase, page } = requireGrpc(event.locals.grpc)

  const [phaseResult, pageResult] = await Promise.all([
    phase.list({ hackathonId: event.params.slug }),
    page.list({ hackathonId: event.params.slug }),
  ])

  const pageTitles = new Map(pageResult.pages.map((p) => [p.id, p.title]))

  const phases = phaseResult.phases.map((p) => ({
    id: p.id,
    name: p.name,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    pageId: p.pageId,
    pageTitle: p.pageId ? pageTitles.get(p.pageId) : undefined,
  }))

  return { hackathonId: event.params.slug, phases }
}

export const actions: Actions = {
  delete: async (event) => {
    const { phase } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const phaseId = form.get("phaseId")
    if (typeof phaseId !== "string" || phaseId === "") {
      return fail(400, { message: "Missing phase id" })
    }

    try {
      await phase.delete({ phaseId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to delete this phase" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Phase not found" })
      }
      throw e
    }

    return { success: true }
  },
}
