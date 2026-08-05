import type { Actions, PageServerLoad } from "./$types"
import { membershipBadgeLabel } from "$lib/utils/hackathonStatus"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // participant with their casbin role and waitlist flag.
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()

  // Frontend-only gate, same shape as the tracks and teams manage routes: the
  // two RPCs below enforce it for real, this only decides whether the page
  // renders at all. The participant list itself stays reachable at
  // `../participants`, which every member may open.
  if (!mayManageParticipants(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "Only the hackathon organizer can manage participants")
  }

  // Waitlisted members are listed too, carrying a "Waitlisted" label. They are
  // real rows in the hackathon's membership, and the label says which is which
  // — hiding them would make the page disagree with the count in the header,
  // and they are the rows Approve exists for.
  const participants = hackathon.members
    .filter((m) => m.user !== undefined)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
      roleLabel: membershipBadgeLabel(m.isWaiting, m.role),
      isWaiting: m.isWaiting,
      isOwner: m.role === HackathonRole.HACKATHON_ROLE_OWNER,
    }))

  return { participants }
}

/** The gRPC errors both write paths can return, as SvelteKit failures. */
function failFor(e: unknown, denied: string) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
    return fail(403, { message: denied })
  }
  if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
    return fail(404, { message: "That participant no longer exists" })
  }
  throw e
}

function userIdFrom(form: FormData): string | undefined {
  const id = form.get("userId")
  return typeof id === "string" && id !== "" ? id : undefined
}

export const actions: Actions = {
  approve: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)

    const userId = userIdFrom(await event.request.formData())
    if (!userId) return fail(400, { message: "No participant was given" })

    try {
      await hackathon.approveParticipant({
        hackathonId: event.params.id,
        userId,
      })
    } catch (e) {
      return failFor(
        e,
        "You don't have permission to approve participants here",
      )
    }

    return {}
  },

  remove: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)

    const userId = userIdFrom(await event.request.formData())
    if (!userId) return fail(400, { message: "No participant was given" })

    try {
      await hackathon.removeParticipant({
        hackathonId: event.params.id,
        userId,
      })
    } catch (e) {
      return failFor(e, "You don't have permission to remove participants here")
    }

    return {}
  },
}
