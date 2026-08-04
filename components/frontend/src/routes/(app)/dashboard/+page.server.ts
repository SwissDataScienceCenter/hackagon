import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser!.id

  // TODO(backend: enroll creator as participant): myResult is participation, not
  // ownership, so a hackathon the viewer created never reaches myHackathons. A
  // public one lands under "other" as though it belonged to someone else; a
  // private one appears nowhere, since the other list is filtered to public.
  // Resolves itself once Create writes the Participant row — no change needed
  // on this side.
  const [allResult, myResult] = await Promise.all([
    hackathon.list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC }),
    hackathon.list({ participantId }),
  ])

  const myIds = new Set(myResult.hackathons.map((h) => h.id))

  return {
    session: event.locals.session,
    myHackathons: myResult.hackathons,
    otherHackathons: allResult.hackathons.filter((h) => !myIds.has(h.id)),
  }
}
