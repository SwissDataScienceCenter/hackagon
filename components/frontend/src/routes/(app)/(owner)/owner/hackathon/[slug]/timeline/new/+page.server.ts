import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { page } = requireGrpc(event.locals.grpc)

  const result = await page.list({ hackathonId: event.params.slug })

  return { pages: result.pages }
}

export const actions: Actions = {
  create: async (event) => {
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
      return fail(400, { message: "Both starts at and ends at must be set together" })
    }

    try {
      await phase.create({
        hackathonId: event.params.slug,
        name,
        description,
        startsAt: hasStartsAt ? new Date(startsAt) : undefined,
        endsAt: hasEndsAt ? new Date(endsAt as string) : undefined,
        pageId: typeof pageId === "string" && pageId !== "" ? pageId : undefined,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to create phases" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/timeline`)
  },
}
