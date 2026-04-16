import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  const { user } = requireGrpc(event.locals.grpc)
  const result = await user.list({})
  return { users: result.users }
}
