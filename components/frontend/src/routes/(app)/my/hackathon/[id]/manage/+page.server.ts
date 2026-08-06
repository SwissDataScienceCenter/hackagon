import type { PageServerLoad } from "./$types"
import { canEditHackathon } from "$lib/navigation"
import { error } from "@sveltejs/kit"

// The organiser's landing page for one event.
//
// Ported from main, which added it for a reason our branch shares: everything
// an organiser does is reachable only from the sidebar, and the capability
// switches — the controls they touch most during an event — sit three clicks
// deep on the timeline page. This is one place that names every destination.
//
// No RPC of its own: the layout's `hackathon.get` already carries the phases,
// the capabilities and the membership this page reads.

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()

  if (!canEditHackathon(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "Only this event's organisers can manage it")
  }

  const currentPhaseName =
    hackathon.phases?.find((p) => p.id === hackathon.currentPhaseId)?.name ?? ""

  return { currentPhaseName }
}
