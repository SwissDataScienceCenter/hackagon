import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import { membershipBadgeLabel } from "$lib/utils/hackathonStatus"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  const participants = hackathon.members
    .filter((m) => m.user !== undefined)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
      email: m.user!.email,
      roleLabel: membershipBadgeLabel(m.isWaiting, m.role),
      isWaiting: m.isWaiting,
      joinedAt: m.joinedAt,
    }))

  return { participants }
}

async function readUserId(request: Request): Promise<string | undefined> {
  const form = await request.formData()
  const userId = form.get("userId")
  return typeof userId === "string" && userId !== "" ? userId : undefined
}

export const actions: Actions = {
  approve: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const userId = await readUserId(event.request)
    if (!userId) return fail(400, { message: "Missing user id" })

    try {
      await hackathon.approveParticipant({ hackathonId: event.params.slug, userId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to approve participants" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Participant not found" })
      }
      throw e
    }
  },

  remove: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const userId = await readUserId(event.request)
    if (!userId) return fail(400, { message: "Missing user id" })

    try {
      await hackathon.removeParticipant({ hackathonId: event.params.slug, userId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to remove participants" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Participant not found" })
      }
      throw e
    }
  },
}
