import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { canEditHackathon } from "$lib/utils/hackathonRole"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// `data.hackathon` reaches the page through the `[id]` layout's own load —
// nothing here needs to re-fetch it, only gate who may see the form.
export const load: PageServerLoad = async (event) => {
  const { myMembership, isGlobalAdmin } = await event.parent()

  if (!canEditHackathon(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "You don't have permission to edit this hackathon")
  }
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

    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Name must be at least 3 characters" })
    }
    if (visibility !== "public" && visibility !== "private") {
      return fail(400, { message: "Visibility is required" })
    }

    // Status is computed server-side from both dates, so one without the other
    // leaves a hackathon that can never be anything but PENDING.
    const hasStartsAt = typeof startsAt === "string" && startsAt !== ""
    const hasEndsAt = typeof endsAt === "string" && endsAt !== ""
    if (hasStartsAt !== hasEndsAt) {
      return fail(400, {
        message: "Start and end date must be set together",
      })
    }
    if (
      hasStartsAt &&
      hasEndsAt &&
      new Date(endsAt as string) < new Date(startsAt as string)
    ) {
      return fail(400, { message: "End date must not precede the start date" })
    }

    try {
      await hackathon.edit({
        hackathonId: event.params.id,
        name: name.trim(),
        visibility:
          visibility === "public"
            ? Visibility.VISIBILITY_PUBLIC
            : Visibility.VISIBILITY_PRIVATE,
        // Sent as typed, not `|| undefined`: unlike Create, this form is always
        // pre-filled with the current value, so an empty string is the user
        // clearing the field on purpose and must reach the backend as "".
        description: typeof description === "string" ? description : undefined,
        logo: typeof logo === "string" ? logo : undefined,
        // TODO(backend: hackathon-edit-clear-dates): `hasStartsAt === hasEndsAt
        // === false` sends both as `undefined`, which `Edit` reads as "leave
        // unchanged" rather than "clear them" — there is no request that
        // returns an already-dated hackathon to dateless. Harmless here: dates
        // can still be *changed* freely, only full removal silently no-ops.
        startsAt: hasStartsAt ? new Date(startsAt as string) : undefined,
        endsAt: hasEndsAt ? new Date(endsAt as string) : undefined,
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

    // Back to the page the form is reached from, so a saved edit lands where the
    // rest of the hackathon's settings are rather than out on the dashboard.
    redirect(303, `/my/hackathon/${event.params.id}/manage`)
  },
}
