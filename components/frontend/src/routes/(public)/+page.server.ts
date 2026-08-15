import type { PageServerLoad } from "./$types"
import {
  publicHackathonClient,
  publicPrizeClient,
} from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { HackathonStatus } from "$lib/server/grpc/generated/hackathon/entities/hackathon_status"

/** How many finished events to look for winners in, newest first. */
const AWARD_EVENTS = 4

export const load: PageServerLoad = async (event) => {
  // A backend outage must cost the LIST, not the page.
  //
  // This awaited bare, so any unreachable backend turned the platform's front
  // page into a 500 — measured at 98 of 356 samples during one e2e run, which
  // wipes and reboots Postgres and the backend by design. The rest of the page
  // is static marketing copy that needs no backend at all, and a stack trace is
  // not something to render at a visitor.
  //
  // But "no events to show" is NOT the truthful thing to render, which is what
  // the comment here used to claim. It is truthful only when there are no
  // events; when the list could not be FETCHED it is a different fact, and
  // flattening the two cost hours on 2026-08-13 — this page and /hackathon both
  // showed nothing while the database held eight public editions and `grpcurl`
  // returned them (the gRPC channel was waiting out its reconnect backoff; see
  // lib/server/grpc/client.ts). In a container where every test run wipes and
  // reseeds the database, "empty" and "unreachable" looking identical is the
  // most expensive confusion available. So the failure is carried, not hidden.
  let hackathons: Awaited<
    ReturnType<typeof publicHackathonClient.list>
  >["hackathons"] = []
  let listUnavailable = false
  try {
    const listed = await publicHackathonClient.list({
      visibilityFilter: Visibility.VISIBILITY_PUBLIC,
    })
    hackathons = listed.hackathons
  } catch (e) {
    event.locals.logger.error(
      { err: e },
      "Public hackathon list unavailable on the landing page — rendering the outage state, not an empty platform.",
    )
    listUnavailable = true
  }
  const result = { hackathons }

  // Winners, from the events that actually finished and recorded them.
  //
  // This section used to be three hard-coded cards — invented projects credited
  // to invented teams, each labelled "1st Place" — on the platform's front
  // page. A fabricated record of who won is worse than an empty section, so it
  // reads the real awards and renders nothing when there are none.
  //
  // Anonymous-readable because PrizeService.Get checks visibility before
  // membership: a public event's awards are the result it announced.
  const finished = result.hackathons
    .filter((h) => h.status === HackathonStatus.HACKATHON_STATUS_FINISHED)
    .sort((a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0))
    .slice(0, AWARD_EVENTS)

  const awards = (
    await Promise.all(
      finished.map(async (h) => {
        // One event's prizes failing must cost that event's cards, not the page.
        const res = await publicPrizeClient
          .get({ hackathonId: h.id })
          .catch(() => null)
        if (!res || !res.finalized) return []

        return res.awards.map((a) => ({
          hackathonId: h.id,
          hackathonName: h.name,
          rank: a.rank,
          title: a.title,
          // The event's own cover. A submission has no image of its own, and
          // inventing one for a real award would be a fabricated record — the
          // exact thing the hard-coded cards here were replaced for. The cover
          // is the event's real picture, so an award card carries a true image
          // or none at all.
          hackathonLogo: h.logo,
        }))
      }),
    )
  )
    .flat()
    // Top placements first, so three cards show three winners rather than three
    // runners-up from the same event.
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)

  return {
    session: event.locals.session,
    hackathons: result.hackathons,
    listUnavailable,
    awards,
  }
}
