import type { Actions, PageServerLoad } from "./$types"
import { resolvePhaseStatus, sortPhasesByStart } from "$lib/utils/phase"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { setCurrentPhase } from "$lib/server/hackathon/stateActions"
import { error } from "@sveltejs/kit"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the phases
  // and the state.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Frontend-only gate, same shape as the tracks and teams manage routes: the
  // RPCs below enforce it for real, this only decides whether the page renders.
  // Everything this loader returns is organizer-only, so the check comes first
  // and a participant is sent none of it — unlike before, when one page served
  // both audiences and had to withhold half its payload field by field.
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can manage the timeline")
  }

  // Empty string rather than undefined when nothing is declared — `state` itself
  // is absent on a hackathon with no state row, which no longer happens for
  // seeded or app-created ones but is still the shape the proto allows.
  const currentPhaseId = hackathon.state?.currentPhaseId ?? ""

  // Same ordering the participant timeline and the header bar use, so no two
  // surfaces disagree about the sequence.
  const phases = sortPhasesByStart(hackathon.phases).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    // A declared current phase wins over the dates — see `resolvePhaseStatus`.
    status: resolvePhaseStatus(p, currentPhaseId || undefined),
    // The page a phase links to. `hackathon.get` nests the pages, so the link
    // needs no lookup of its own; only phases with a page get one.
    pageId: p.pageId ?? "",
  }))

  return {
    hackathonId: hackathon.id,
    phases,
  }
}

export const actions: Actions = {
  // The one write on this page, and the only one a phase has ever had: move the
  // marker. The capability switches live on Settings and are not mirrored here —
  // a phase decides nothing about what participants may do.
  setCurrent: (event) => setCurrentPhase(event, event.params.id),
}
