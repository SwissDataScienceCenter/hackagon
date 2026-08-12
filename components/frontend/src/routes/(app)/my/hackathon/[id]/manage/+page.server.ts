import type { Actions, PageServerLoad } from "./$types"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import {
  enabledCapabilities,
  phaseCapabilities,
} from "$lib/server/hackathon/phaseForm"
import {
  applyPhaseCapabilities,
  saveCapabilities,
  setCurrentPhase,
} from "$lib/server/hackathon/stateActions"
import { currentAndNextPhase, unmetPhaseCapabilities } from "$lib/utils/phase"
import { error } from "@sveltejs/kit"

// The organiser's overview of the hackathon itself, as against `/overview`,
// which is the member's and stays participant-shaped for every viewer.
//
// Everything hackathon-wide that an organiser sets lives here: what participants
// may do, and which phase is current. Per-phase editing stayed on the timeline,
// which is a list of phases — this is a single page about the hackathon, and
// mixing the two was what buried the capability switches under a heading nobody
// opened unless they already suspected something.
//
// No RPC of its own: the layout's `hackathon.get` already carries the phases,
// the capabilities and the membership this page reads.
//
// Deliberately NOT a `hackathonState` blob on the layout, which is how main
// carries the same fields. Ours is derived here, in the one route that reads it,
// because on this branch `HackathonState` is a projection over the Capability
// model with no enforcement behind it — see `.claude/CLAUDE.md`. A second
// subtree-wide object of that name would read as the gate main made it, and two
// gates that can disagree are worse than either.

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()

  // The same owner-or-admin gate `manageNav` applies, so the sidebar can never
  // offer this page to someone it then refuses. Deliberately NOT
  // `canEditHackathon`, which additionally wants the owner confirmed: a
  // waitlisted owner gets the section in the sidebar, so gating the page it
  // leads to more narrowly than the entry is a link that 403s. Editing the
  // hackathon's own record is the narrower thing, and it is gated on its own
  // below.
  if (!mayManagePhases(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "Only this event's organisers can manage it")
  }

  const enabled = enabledCapabilities(hackathon.capabilities)

  // Empty string rather than undefined when nothing is declared, which
  // `currentAndNextPhase` reads as "fall back to the dates" — the same
  // precedence `resolvePhaseStatus` applies on the timeline, so the two surfaces
  // cannot name different phases as the live one.
  const currentPhaseId = hackathon.currentPhaseId ?? ""
  const { current, next, declared } = currentAndNextPhase(
    hackathon.phases,
    currentPhaseId || undefined,
  )

  const currentCapabilities = current
    ? phaseCapabilities(hackathon.capabilities, current.id)
    : []

  return {
    hackathonId: hackathon.id,
    hackathonName: hackathon.name,
    // Whether "now" is an organiser's declaration or just the calendar. This is
    // the one screen where the difference is actionable, since only a
    // declaration can be cleared.
    declared,
    currentPhase: current
      ? {
          id: current.id,
          name: current.name,
          startsAt: current.startsAt,
          endsAt: current.endsAt,
        }
      : null,
    nextPhase: next
      ? {
          id: next.id,
          name: next.name,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
        }
      : null,
    // Passed through exactly as `Hackathon.capabilities` arrives, which is what
    // `CapabilitiesPanel` takes: the four states — COMING, OPEN, CLOSED,
    // UNGOVERNED — are what the panel is for, and a `{value, enabled}`
    // projection made here is a place three of them collapse into one unticked
    // box on the way to the one screen whose job is to tell them apart.
    capabilities: hackathon.capabilities,
    // What the current phase says should be happening but is switched off. Only
    // ever computed against the CURRENT phase: a future phase planning a
    // capability that is off is not a problem, it is simply not time yet.
    unmet: unmetPhaseCapabilities(currentCapabilities, enabled),
    // Surfaces the approval queue, which is the organiser action most easily
    // forgotten — nothing about a waitlisted participant is visible from
    // anywhere else, and a waitlisted user holds no read on anything in the
    // hackathon until approved. Counted the way the participants page counts its
    // rows — it drops a member with no user too — so the two cannot disagree.
    waitingCount: hackathon.members.filter(
      (m) => m.user !== undefined && m.isWaiting,
    ).length,
  }
}

// All three are shared with the timeline, which keeps its per-phase "Make
// current" buttons. An action can only be reached from the route that declares
// it, hence the module rather than a second copy.
export const actions: Actions = {
  setCurrent: (event) => setCurrentPhase(event, event.params.id),
  saveCapabilities: (event) => saveCapabilities(event, event.params.id),
  applyPhaseCapabilities: (event) =>
    applyPhaseCapabilities(event, event.params.id),
}
