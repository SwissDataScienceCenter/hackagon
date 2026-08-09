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
  // is static marketing copy that needs no backend at all, and "no events to
  // show" is a truthful, calm thing to render; a stack trace is not.
  //
  // The awards block below already degrades this way. Now the list does too.
  const result = await publicHackathonClient
    .list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC })
    .catch(() => ({ hackathons: [] }))

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
    awards,
  }
}
