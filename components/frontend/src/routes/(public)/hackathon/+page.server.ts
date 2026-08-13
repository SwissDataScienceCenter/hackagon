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
  // as the landing page.
  //
  // But it must SAY SO. This used to be `.catch(() => ({ hackathons: [] }))`
  // with a comment calling an empty list "a calm and truthful thing for a
  // visitor to read during an outage", and it is only the first of those: an
  // empty list is not truthful when the truth is "I could not ask". Measured
  // 2026-08-13: this page rendered ZERO events while `grpcurl` returned eight
  // from the same database, for 51 seconds AFTER the backend was healthy again
  // (the gRPC channel was still waiting out its reconnect backoff, whose
  // default cap is 120s — see lib/server/grpc/client.ts). "The seed data is
  // gone" and "I cannot reach the backend" are indistinguishable from the
  // browser unless the page distinguishes them, and hours went into the wrong
  // one.
  //
  // So the failure is carried to the component instead of being flattened into
  // the success shape. The page still renders, still has no stack trace on it,
  // and no longer claims an empty platform.
  let hackathons: Awaited<
    ReturnType<typeof publicHackathonClient.list>
  >["hackathons"] = []
  let listUnavailable = false
  try {
    const result = await publicHackathonClient.list({
      visibilityFilter: Visibility.VISIBILITY_PUBLIC,
    })
    hackathons = result.hackathons
  } catch (e) {
    event.locals.logger.error(
      { err: e },
      "Public hackathon list unavailable — rendering the outage state, not an empty platform.",
    )
    listUnavailable = true
  }

  return {
    session: event.locals.session,
    hackathons,
    listUnavailable,
  }
}
