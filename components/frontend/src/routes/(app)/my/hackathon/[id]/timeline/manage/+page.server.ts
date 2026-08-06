import type { Actions, PageServerLoad } from "./$types"
import {
  extraEnabledCapabilities,
  resolvePhaseStatus,
  sortPhasesByStart,
} from "$lib/utils/phase"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { setCurrentPhase } from "$lib/server/hackathon/stateActions"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
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
  const enabled = enabledCapabilities(hackathon.state)

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
    // Raw enum numbers — `capabilityLabel` in `$lib/utils/phase` is keyed by
    // them, so the page needs no server-only import to render them.
    capabilities: p.capabilities as number[],
    // The page a phase links to. `hackathon.get` nests the pages, so the link
    // needs no lookup of its own; only phases with a page get one.
    pageId: p.pageId ?? "",
  }))

  const current = phases.find((p) => p.id === currentPhaseId)

  return {
    hackathonId: hackathon.id,
    phases,
    // Lets the page tick off which of the current phase's plans are actually
    // live — for the current phase alone: marking a future phase's plan "not
    // enabled" would read as broken when it is simply not time yet.
    //
    // Read-only here. The switches that change it moved to the overview, so what
    // this page still needs is the comparison, not the control.
    enabled,
    // Switched on beyond what this phase planned for. Information, not a problem.
    alsoEnabled: extraEnabledCapabilities(current?.capabilities ?? [], enabled),
  }
}

export const actions: Actions = {
  // The one write left on this page. The capability switches moved to Manage
  // Hackathon, taking `saveCapabilities` and `applyPhaseCapabilities` with them;
  // this shares `setCurrentPhase` with that page, which advances to the next
  // phase while these buttons pick any phase off the list.
  setCurrent: (event) => setCurrentPhase(event, event.params.id),
}
