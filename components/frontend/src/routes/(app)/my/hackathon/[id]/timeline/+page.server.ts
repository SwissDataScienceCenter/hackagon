import type { PageServerLoad } from "./$types"
import { resolvePhaseStatus, sortPhasesByStart } from "$lib/utils/phase"

// No owner/admin check here: the way into phase management is the sidebar's
// Manage section, which gates itself on the same subjects (see $lib/navigation's
// manageNav) and owns every phase action plus the capability switches. This page
// is the participant view and reads the same for everyone.
export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the phases
  // and the state, and `hackathonState` is the derivation the overview's state
  // card reads too — so the two surfaces cannot name a different phase as the
  // live one or disagree about what is open.
  const { hackathon, hackathonState, myMembership } = await event.parent()

  // Empty string rather than undefined when nothing is declared — `state` itself
  // is absent on a hackathon with no state row, which no longer happens for
  // seeded or app-created ones but is still the shape the proto allows.
  const currentPhaseId = hackathon.state?.currentPhaseId ?? ""

  // Same ordering the manage page and the header bar use, so the surfaces never
  // disagree about the sequence a participant is looking at.
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

  // Deliberately *not* `Phase.capabilities`. A phase's capability tags are a
  // plan — `db/schema/phase.go` says so outright, and advancing to a phase
  // grants nobody anything — so showing them to a participant promises things
  // that may well be switched off. What is actually open comes from
  // `HackathonState`, and the page shows it against the live phase only.
  return {
    hackathonId: hackathon.id,
    phases,
    // Which row is "now". `currentAndNextPhase` picks exactly one even when two
    // phases' dates overlap, so only one row can ever take the card treatment —
    // an overlapping second one keeps its "In progress" label and stays a row.
    livePhaseId: hackathonState.currentPhase?.id ?? "",
    // Which row gets the "starts in …" countdown. Named rather than derived
    // here so it is the same "next" the overview's card names.
    nextPhaseId: hackathonState.nextPhase?.id ?? "",
    // Whether an organizer declared the current phase, in which case no date
    // starts anything and the countdown above is withheld — same rule
    // `nextBoundary` applies to the overview's card. The page needs the flag
    // rather than deriving it from `livePhaseId`, which is set either way.
    declared: hackathonState.declared,
    enabled: hackathonState.enabled,
    hasState: hackathonState.hasState,
    // Every capability check also requires a confirmed membership, so "open now"
    // is not yet true for someone still on the waitlist.
    isWaiting: myMembership?.isWaiting ?? false,
  }
}
