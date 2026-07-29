import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { user } = requireGrpc(event.locals.grpc)

  try {
    const result = await user.list({})
    return { users: result.users }
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to view the user list")
    }
    throw e
  }
}
