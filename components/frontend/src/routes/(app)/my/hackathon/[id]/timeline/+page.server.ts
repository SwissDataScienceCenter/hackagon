import type { Actions, PageServerLoad } from "./$types"
import {
  extraEnabledCapabilities,
  resolvePhaseStatus,
  sortPhasesByStart,
} from "$lib/utils/phase"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import {
  enabledCapabilities,
  phaseCapabilities,
} from "$lib/server/hackathon/phaseForm"
import { setCurrentPhase } from "$lib/server/hackathon/stateActions"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the phases
  // and the state.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const mayManage = mayManagePhases(myMembership ?? undefined, isAdmin)

  // Empty string rather than undefined when nothing is declared — `state` itself
  // is absent on a hackathon with no state row, which no longer happens for
  // seeded or app-created ones but is still the shape the proto allows.
  const currentPhaseId = hackathon.currentPhaseId ?? ""
  const enabled = enabledCapabilities(hackathon.capabilities)

  // Same ordering the header bar uses, so the two never disagree about the
  // sequence a participant is looking at.
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
    capabilities: phaseCapabilities(hackathon.capabilities, p.id),
    // The page a phase links to. `hackathon.get` nests the pages, so the link
    // needs no lookup of its own; only phases with a page get one.
    pageId: p.pageId ?? "",
  }))

  const current = phases.find((p) => p.id === currentPhaseId)

  return {
    hackathonId: hackathon.id,
    phases,
    mayManage,
    // The switches themselves, the "no state row" case and the plan-vs-reality
    // warning have all moved to Manage Hackathon along with the panel that
    // rendered them. What is left here is per-phase and read-only.
    //
    // Lets the page tick off which of the current phase's plans are actually
    // live. Organizer-only, so a participant's tags stay plain — and
    // deliberately used for the current phase alone: marking a future phase's
    // plan "not enabled" would read as broken when it is simply not time yet.
    enabled: mayManage ? enabled : [],
    // Switched on beyond what this phase planned for. Information, not a problem.
    alsoEnabled: mayManage
      ? extraEnabledCapabilities(current?.capabilities ?? [], enabled)
      : [],
  }
}

// Only the phase pointer is written from here now. The two capability actions
// went with the panel to Manage Hackathon; all three live in
// `$lib/server/hackathon/stateActions` because an action can only be reached
// from the route that declares it, and this one still has "Make current" and
// "Clear current phase" on every row.
export const actions: Actions = {
  setCurrent: (event) => setCurrentPhase(event, event.params.id),
}
