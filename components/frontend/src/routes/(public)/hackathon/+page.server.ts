import type { PageServerLoad } from "./$types"
import { publicHackathonClient } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"

// The hackathon list as its own page, one of the platform's three top-level
// destinations (Home, Hackathons, About).
//
// Public client, like the landing page: this is readable without an account,
// and private events are filtered out server-side rather than hidden in the UI.
export const load: PageServerLoad = async (event) => {
  // Degrades rather than 500s when the backend is unreachable — same reasoning
  // as the landing page. An empty list renders "no hackathons yet", which is a
  // calm and truthful thing for a visitor to read during an outage.
  const result = await publicHackathonClient
    .list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC })
    .catch(() => ({ hackathons: [] }))

  return {
    session: event.locals.session,
    hackathons: result.hackathons,
  }
}
