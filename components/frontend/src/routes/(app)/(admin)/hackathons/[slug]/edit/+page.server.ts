import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)

  let result
  try {
    result = await hackathon.get({ hackathonId: event.params.slug })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Hackathon not found")
    }
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to edit this hackathon")
    }
    throw e
  }

  if (!result.hackathon) {
    error(404, "Hackathon not found")
  }

  return { hackathon: result.hackathon }
}

export const actions: Actions = {
  edit: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const name = form.get("name")
    const visibility = form.get("visibility")
    const description = form.get("description")
    const startsAt = form.get("startsAt")
    const endsAt = form.get("endsAt")
    const logo = form.get("logo")

    if (typeof name !== "string" || name.trim().length < 1) {
      return fail(400, { message: "Name is required" })
    }
    if (visibility !== "public" && visibility !== "private") {
      return fail(400, { message: "Visibility is required" })
    }
    const hasStartsAt = typeof startsAt === "string" && startsAt !== ""
    const hasEndsAt = typeof endsAt === "string" && endsAt !== ""
    if (hasStartsAt !== hasEndsAt) {
      return fail(400, {
        message: "Both starts at and ends at must be set together",
      })
    }

    try {
      await hackathon.edit({
        hackathonId: event.params.slug,
        name,
        visibility:
          visibility === "public"
            ? Visibility.VISIBILITY_PUBLIC
            : Visibility.VISIBILITY_PRIVATE,
        description: typeof description === "string" ? description : undefined,
        startsAt: hasStartsAt ? new Date(startsAt) : undefined,
        endsAt: hasEndsAt ? new Date(endsAt as string) : undefined,
        logo: typeof logo === "string" ? logo : undefined,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit this hackathon",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Hackathon not found" })
      }
      throw e
    }

    redirect(303, `/hackathons/${event.params.slug}`)
  },
}
