import type { PageServerLoad } from "./$types"
import { publicClient } from "$lib/server/grpc/client"

/**
 * The public hackathon directory, from the service built for visitors.
 *
 * It used to call `HackathonService.List` filtered to public. That response is
 * a participant-facing type: it carries no users *today* only because this
 * particular query loads no member edges, which is a property of the query
 * rather than of the type, and one a future edit could quietly change.
 * `PublicService.ListHackathons` returns a summary type with nowhere for a
 * person to appear.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathons } = await publicClient().listHackathons({})

  return {
    session: event.locals.session,
    hackathons,
  }
}
