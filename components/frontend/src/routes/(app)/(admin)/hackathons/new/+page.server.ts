import type { Actions } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const actions: Actions = {
  create: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const name = form.get("name")
    const visibility = form.get("visibility")
    const description = form.get("description")
    const startsAt = form.get("startsAt")
    const endsAt = form.get("endsAt")
    const logo = form.get("logo")

    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Name must be at least 3 characters" })
    }
    if (visibility !== "public" && visibility !== "private") {
      return fail(400, { message: "Visibility is required" })
    }
    const hasStartsAt = typeof startsAt === "string" && startsAt !== ""
    const hasEndsAt = typeof endsAt === "string" && endsAt !== ""
    if (hasStartsAt !== hasEndsAt) {
      return fail(400, { message: "Both starts at and ends at must be set together" })
    }

    let hackathonId: string
    try {
      const result = await hackathon.create({
        name,
        visibility:
          visibility === "public" ? Visibility.VISIBILITY_PUBLIC : Visibility.VISIBILITY_PRIVATE,
        description: typeof description === "string" && description.trim() !== "" ? description : undefined,
        startsAt: hasStartsAt ? new Date(startsAt) : undefined,
        endsAt: hasEndsAt ? new Date(endsAt as string) : undefined,
        logo: typeof logo === "string" && logo.trim() !== "" ? logo : undefined,
      })
      hackathonId = result.hackathonId
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to create a hackathon" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${hackathonId}`)
  },
}
