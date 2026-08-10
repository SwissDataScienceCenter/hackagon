import type { Actions, PageServerLoad } from "./$types"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { CAPABILITY_ORDER } from "$lib/server/hackathon/phaseForm"
import {
  applyPhaseCapabilities,
  saveCapabilities,
  setCurrentPhase,
} from "$lib/server/hackathon/stateActions"
import { error } from "@sveltejs/kit"

/**
 * The organiser's overview of the hackathon itself, as against `/overview`,
 * which is the member's and stays participant-shaped for every viewer.
 *
 * Everything hackathon-wide that an organiser sets lives here: what participants
 * may do, and which phase is current. The per-phase editing stayed on Manage
 * Timeline, which is a list of phases — this is a single page about the
 * hackathon, and mixing the two was what buried the capability switches under a
 * heading nobody opened unless they already suspected something.
 *
 * No RPC of its own: the layout's `hackathon.get` already returned the phases and
 * the state, and `hackathonState` is the derivation every surface shares.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership, hackathonState } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Frontend-only gate, same shape as the other manage routes: the RPCs below
  // enforce it for real, this only decides whether the page renders. Everything
  // it returns is organiser-only, so the check comes first.
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can manage this hackathon")
  }

  return {
    hackathonId: hackathon.id,
    hackathonName: hackathon.name,
    // The switches. Built here because `CAPABILITY_ORDER` is the generated enum
    // and is server-only; the on/off flags themselves ride on `hackathonState`.
    capabilityStates: CAPABILITY_ORDER.map((c) => ({
      value: c as number,
      enabled: hackathonState.enabled.includes(c as number),
    })),
    // Badges the Participants tile, so approving is not something an organiser
    // has to open a screen to discover. Counted the way Manage Participants counts
    // its rows — it drops a member with no user too — so the two cannot disagree.
    waitingCount: hackathon.members.filter(
      (m) => m.user !== undefined && m.isWaiting,
    ).length,
  }
}

export const actions: Actions = {
  setCurrent: (event) => setCurrentPhase(event, event.params.id),
  saveCapabilities: (event) => saveCapabilities(event, event.params.id),
  applyPhaseCapabilities: (event) =>
    applyPhaseCapabilities(event, event.params.id),
}
