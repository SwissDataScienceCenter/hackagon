import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
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
      error(403, "You don't have permission to view this hackathon")
    }
    throw e
  }

  if (!result.hackathon) {
    error(404, "Hackathon not found")
  }

  return { hackathon: result.hackathon }
}
