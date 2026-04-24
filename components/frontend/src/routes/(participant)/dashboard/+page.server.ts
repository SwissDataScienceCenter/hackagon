import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser!.id

  const [allResult, myResult] = await Promise.all([
    hackathon.list({}),
    hackathon.list({ participantId }),
  ])

  return {
    session: event.locals.session,
    hackathons: allResult.hackathons,
    myHackathons: myResult.hackathons,
  }
}
