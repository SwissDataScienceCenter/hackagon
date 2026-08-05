import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The roles casbin reports through WhoAmI, already on locals — the same source
// the sidebar uses to decide whether to offer this page. `hackathon:create` has
// no read endpoint to probe, so this is the closest the frontend can get to
// asking the backend without a write; Create itself stays authoritative below.
function mayCreate(roles: GlobalRole[]): boolean {
  return (
    roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN) ||
    roles.includes(GlobalRole.GLOBAL_ROLE_HACKATHON_ORGANIZER)
  )
}

export const load: PageServerLoad = async (event) => {
  // The URL is guessable even though the sidebar only offers it to an organizer
  // or admin. Refuse up front rather than rendering a form whose submit is the
  // first thing to fail.
  if (!mayCreate(event.locals.platformUser?.roles ?? [])) {
    error(403, "You don't have permission to create a hackathon")
  }

  return {}
}

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

    let hackathonId: string
    try {
      const result = await hackathon.create({
        name: name.trim(),
        visibility:
          visibility === "public"
            ? Visibility.VISIBILITY_PUBLIC
            : Visibility.VISIBILITY_PRIVATE,
        description:
          typeof description === "string" && description.trim() !== ""
            ? description
            : undefined,
        startsAt: hasStartsAt ? new Date(startsAt as string) : undefined,
        endsAt: hasEndsAt ? new Date(endsAt as string) : undefined,
        logo: typeof logo === "string" && logo.trim() !== "" ? logo : undefined,
      })
      hackathonId = result.hackathonId
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to create a hackathon",
        })
      }
      throw e
    }

    // Reachable because Create grants the caller the casbin Owner role, which
    // satisfies Get's hackathon:read.
    //
    // TODO(backend: enroll creator as participant): Create writes no Participant
    // row, so until it does, the hackathon the organizer just made is missing
    // from every participant-filtered list — My Hackathons and the sidebar — and
    // this redirect is the only route to it. The hero also shows no membership
    // badge, since that comes from the member list Get builds from that table.
    redirect(303, `/my/hackathon/${hackathonId}/overview`)
  },
}
