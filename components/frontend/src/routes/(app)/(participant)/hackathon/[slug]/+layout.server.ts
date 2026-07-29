import type { LayoutServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: LayoutServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  let result
  try {
    result = await hackathon.get({ hackathonId: event.params.slug })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You are not a confirmed member of this hackathon")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Hackathon not found")
    }
    throw e
  }

  if (!result.hackathon) {
    error(404, "Hackathon not found")
  }

  const myMembership =
    result.hackathon.members.find((m) => m.user?.id === platformUserId) ?? null

  return { hackathon: result.hackathon, myMembership }
}
