import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// Invitation links: how a PRIVATE event is shared.
//
// Anyone holding a link can see the event and request a place — approval is
// still an organiser's decision on the participants page, so a forwarded link
// cannot insert a stranger into the roster. A link that spreads further than
// intended is revoked here.
//
// Lifted out of the old one-page cockpit into a route of its own, which is how
// this design organises organiser tools.

function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only this event's organisers can do that." })
    if (e.code === Status.NOT_FOUND)
      return fail(404, { message: "That link no longer exists." })
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details })
  }
  throw e
}

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { hackathon: client } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Same gate the rest of the organiser tools use.
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only this event's organisers can manage invitations")
  }

  const { invites } = await client.listInvites({ hackathonId: event.params.id })

  return {
    hackathonName: hackathon.name,
    isPrivate: hackathon.visibility === 2,
    invites: invites.map((i) => ({
      id: i.id,
      token: i.token,
      note: i.note ?? "",
      createdAt: i.createdAt,
      revokedAt: i.revokedAt ?? undefined,
    })),
  }
}

export const actions: Actions = {
  create: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    try {
      await hackathon.createInvite({
        hackathonId: event.params.id,
        note: String(form.get("note") ?? ""),
      })
    } catch (e) {
      return formError(e)
    }

    return { created: true }
  },

  revoke: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const inviteId = String(form.get("inviteId") ?? "")
    if (!inviteId) return fail(400, { message: "Missing invite." })

    try {
      await hackathon.revokeInvite({ inviteId })
    } catch (e) {
      return formError(e)
    }

    return { revoked: inviteId }
  },
}
