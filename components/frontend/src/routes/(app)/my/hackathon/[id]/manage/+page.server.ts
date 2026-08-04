import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The organizer cockpit. Everything here was API-only until now: approving
// participants, publishing event pages and handing out invitation links all
// required grpcurl.
//
// The backend stays authoritative — every RPC below runs its own casbin check
// — so this route only surfaces the controls and translates the verdicts.

/** Maps a gRPC failure onto a form error, rethrowing anything unexpected. */
function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only the event's organizers can do that." })
    if (e.code === Status.UNAUTHENTICATED)
      return fail(401, { message: "Please sign in again." })
    if (e.code === Status.NOT_FOUND) return fail(404, { message: "That item no longer exists." })
    if (e.code === Status.ALREADY_EXISTS)
      return fail(409, { message: "That already exists." })
    if (e.code === Status.FAILED_PRECONDITION)
      return fail(409, { message: e.details || "That isn't possible right now." })
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details || "Invalid input." })
  }
  throw e
}

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const hackathonId = event.params.id

  let full
  try {
    full = await hackathon.get({ hackathonId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "You are not a member of this hackathon")
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) error(404, "Hackathon not found")
    throw e
  }
  if (!full.hackathon) error(404, "Hackathon not found")

  // Invitation links carry live secrets, so ListInvites requires hackathon
  // write. A member who is not an organizer simply gets no invite panel
  // rather than an error page.
  let invites: {
    id: string
    token: string
    note: string
    createdAt?: Date
  }[] = []
  let isOrganizer = true
  try {
    const res = await hackathon.listInvites({ hackathonId })
    invites = res.invites.map((i) => ({
      id: i.id,
      token: i.token,
      note: i.note,
      createdAt: i.createdAt,
    }))
  } catch (e) {
    if (
      e instanceof ClientError &&
      (e.code === Status.PERMISSION_DENIED || e.code === Status.UNAUTHENTICATED)
    ) {
      isOrganizer = false
    } else {
      throw e
    }
  }

  return {
    hackathon: full.hackathon,
    members: full.hackathon.members,
    pages: full.hackathon.pages,
    invites,
    isOrganizer,
  }
}

export const actions: Actions = {
  approve: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const userId = String(form.get("userId") ?? "")
    if (!userId) return fail(400, { message: "Missing participant." })
    try {
      await hackathon.approveParticipant({ hackathonId: event.params.id, userId })
    } catch (e) {
      return formError(e)
    }

    return { approved: userId }
  },

  remove: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const userId = String(form.get("userId") ?? "")
    if (!userId) return fail(400, { message: "Missing participant." })
    try {
      await hackathon.removeParticipant({ hackathonId: event.params.id, userId })
    } catch (e) {
      return formError(e)
    }

    return { removed: userId }
  },

  createInvite: async (event) => {
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

    return { inviteCreated: true }
  },

  revokeInvite: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const inviteId = String(form.get("inviteId") ?? "")
    if (!inviteId) return fail(400, { message: "Missing invite." })
    try {
      await hackathon.revokeInvite({ inviteId })
    } catch (e) {
      return formError(e)
    }

    return { inviteRevoked: inviteId }
  },

  createPage: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const title = String(form.get("title") ?? "").trim()
    if (!title) return fail(400, { message: "A page needs a title." })
    try {
      // `order` is assigned by the backend (max+1); reordering is a separate
      // MoveUp/MoveDown/SetOrder concern.
      await page.create({
        hackathonId: event.params.id,
        title,
        content: String(form.get("content") ?? ""),
        visible: form.get("visible") === "on",
      })
    } catch (e) {
      return formError(e)
    }

    return { pageCreated: title }
  },

  editPage: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const pageId = String(form.get("pageId") ?? "")
    if (!pageId) return fail(400, { message: "Missing page." })
    try {
      await page.edit({
        pageId,
        title: String(form.get("title") ?? ""),
        content: String(form.get("content") ?? ""),
        // An unchecked checkbox submits nothing, so absence means "hide".
        visible: form.get("visible") === "on",
      })
    } catch (e) {
      return formError(e)
    }

    return { pageEdited: pageId }
  },

  deletePage: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const pageId = String(form.get("pageId") ?? "")
    if (!pageId) return fail(400, { message: "Missing page." })
    try {
      await page.delete({ pageId })
    } catch (e) {
      return formError(e)
    }

    return { pageDeleted: pageId }
  },
}
