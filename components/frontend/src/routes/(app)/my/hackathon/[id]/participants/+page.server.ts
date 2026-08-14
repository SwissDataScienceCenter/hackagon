import type { Actions, PageServerLoad } from "./$types"
import { membershipBadgeLabel } from "$lib/utils/hackathonStatus"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // participant with their casbin role and waitlist flag.
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()

  // Waitlisted members are listed too, carrying a "Waitlisted" label. They are
  // real rows in the hackathon's membership, and the label says which is which
  // — hiding them would make the page disagree with the count in the header.
  const participants = hackathon.members
    .filter((m) => m.user !== undefined)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
      roleLabel: membershipBadgeLabel(m.isWaiting, m.role),
      isWaiting: m.isWaiting,
      isOwner: m.role === HackathonRole.HACKATHON_ROLE_OWNER,
      isSelf: m.user!.id === event.locals.platformUser?.id,
    }))

  // The backend refuses to demote the last organizer. Counting them here is
  // what keeps that refusal from being the way people find out: with one owner
  // left the button is not offered at all.
  const ownerCount = participants.filter((p) => p.isOwner).length

  return {
    hackathonId: hackathon.id,
    participants,
    ownerCount,
    // 0 means unlimited — the page renders the fullness gauge and the
    // over-capacity warning only when a cap is set.
    maxParticipants: hackathon.maxParticipants ?? 0,
    mayManage: mayManageParticipants(myMembership ?? undefined, isGlobalAdmin),
  }
}

/** The gRPC errors these write paths can return, as SvelteKit failures. */
function failFor(e: unknown, denied: string) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
    return fail(403, { message: denied })
  }
  if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
    return fail(404, { message: "That participant no longer exists" })
  }
  // The owner RPCs refuse the last organizer and the not-yet-approved. Both
  // carry a message written for the person reading it, so pass it through
  // rather than replacing it with a generic one.
  if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
    return fail(409, { message: e.details })
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

    return { ok: true }
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

    return { ok: true }
  },

  promote: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)

    const userId = userIdFrom(await event.request.formData())
    if (!userId) return fail(400, { message: "No participant was given" })

    try {
      await hackathon.addOwner({ hackathonId: event.params.id, userId })
    } catch (e) {
      return failFor(e, "You don't have permission to add organizers here")
    }

    return { ok: true }
  },

  demote: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)

    const userId = userIdFrom(await event.request.formData())
    if (!userId) return fail(400, { message: "No participant was given" })

    try {
      await hackathon.removeOwner({ hackathonId: event.params.id, userId })
    } catch (e) {
      return failFor(e, "You don't have permission to remove organizers here")
    }

    return { ok: true }
  },
}
