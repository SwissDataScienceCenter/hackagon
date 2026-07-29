import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)

  const result = await hackathon.list({})
  return { hackathons: result.hackathons }
}
