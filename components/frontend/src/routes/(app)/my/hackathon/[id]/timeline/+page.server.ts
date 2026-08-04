import type { PageServerLoad } from "./$types"
import { phaseStatus, sortPhasesByStart } from "$lib/utils/phase"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the phases.
  const { hackathon } = await event.parent()

  // Same ordering the header bar uses, so the two never disagree about the
  // sequence a participant is looking at.
  const phases = sortPhasesByStart(hackathon.phases).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    status: phaseStatus(p.startsAt, p.endsAt),
  }))

  // TODO: a phase may link to a Page (`pageId`), and `hackathon.get` already
  // returns those pages with their content — but there is no participant-facing
  // page route to send anyone to, so the link is left out rather than rendered
  // dead. Nothing is missing on the backend side; this needs a
  // `my/hackathon/[id]/pages/[pageId]` route on ours.

  return { phases }
}
