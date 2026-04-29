import type { PageServerLoad } from "./$types"
import { publicHackathonClient } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"

export const load: PageServerLoad = async (event) => {
  const result = await publicHackathonClient.list({
    visibilityFilter: Visibility.VISIBILITY_PUBLIC,
  })
  return {
    session: event.locals.session,
    hackathons: result.hackathons,
  }
}
