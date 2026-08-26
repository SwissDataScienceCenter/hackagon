import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import {
  deadInvites,
  inviteRows,
  liveInvites,
} from "$lib/server/hackathon/invites"
import { isPrivate } from "$lib/utils/hackathonStatus"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// How a private event is shared: a link an organiser mints here and mails out
// themselves. The platform sends nothing — there is no mail path in the backend
// — so the deliverable of this page is a URL on the clipboard.
//
// A link grants **visibility, not membership**. Whoever holds it can see the
// event and ask to join; the Waitlist page is still where somebody is let in. So
// a link forwarded beyond the people it was meant for cannot put a stranger in
// the roster — it only gets them as far as asking.
//
// Private only. `CreateInvite` never checks visibility, so the RPC would happily
// mint a link for a public hackathon — and it would grant nothing, because
// `Join` only consults a token when the hackathon is private
// (`hackathon_service.go:511`). That is why the gate is here and in `manageNav`
// rather than left to the backend to refuse.

function inviteFail(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only this event's organizers can do that." })
    if (e.code === Status.NOT_FOUND)
      return fail(404, { message: "That link no longer exists." })
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details || "That link is not valid." })
  }
  throw e
}

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // The same owner-or-admin gate the rest of the organiser tools use. The four
  // invite RPCs all require `hackathon:write`, so this only decides whether the
  // page renders — it never replaces the backend's check.
  if (!mayManageParticipants(myMembership ?? undefined, isAdmin)) {
    error(403, "Only this event's organizers can manage its invitations")
  }

  if (!isPrivate(hackathon.visibility)) {
    error(
      404,
      "This event is public, so it needs no invitations — anybody can find it and ask to join",
    )
  }

  const { hackathon: client } = requireGrpc(event.locals.grpc)
  const { invites } = await client.listInvites({ hackathonId: hackathon.id })

  // `event.url.origin` because there is no configured public base URL to read.
  // Resolved here rather than in the page so the copyable value is server-built
  // and identical whether the page was server-rendered or navigated to.
  const rows = inviteRows(invites, event.url.origin, new Date())

  return {
    hackathonId: hackathon.id,
    hackathonName: hackathon.name,
    live: liveInvites(rows),
    dead: deadInvites(rows),
  }
}

export const actions: Actions = {
  create: async (event) => {
    const { hackathon: client } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const note = String(form.get("note") ?? "").trim()

    // The proto caps it at 500; saying so here beats a protovalidate error
    // quoting a field number.
    if (note.length > 500) {
      return fail(400, { message: "Keep the note under 500 characters." })
    }

    try {
      await client.createInvite({
        hackathonId: event.params.id,
        // Absent rather than empty: a blank note is no note.
        note: note || undefined,
        // Deliberately unset. `CreateInvite` then defaults the expiry to the
        // hackathon's own end date, which is the answer an organiser wants and
        // the one thing they cannot get wrong. Offering a date picker here would
        // let somebody mint a link that is already dead, and there is no reason
        // to want one.
        expiresAt: undefined,
      })
    } catch (e) {
      return inviteFail(e)
    }

    return { created: true }
  },

  revoke: async (event) => {
    const { hackathon: client } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const inviteId = String(form.get("inviteId") ?? "")
    if (!inviteId) return fail(400, { message: "No link was given." })

    try {
      await client.revokeInvite({ inviteId })
    } catch (e) {
      return inviteFail(e)
    }

    return { revoked: true }
  },
}
