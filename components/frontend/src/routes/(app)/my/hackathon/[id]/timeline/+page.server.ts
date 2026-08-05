import type { PageServerLoad } from "./$types"
import { resolvePhaseStatus, sortPhasesByStart } from "$lib/utils/phase"

// No owner/admin check here: the way into phase management is the sidebar's
// Manage section, which gates itself on the same subjects (see $lib/navigation's
// manageNav) and owns every phase action plus the capability switches. This page
// is the participant view and reads the same for everyone.
export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the phases
  // and the state.
  const { hackathon } = await event.parent()

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
    // What the phase is planned for, as raw enum numbers — `capabilityLabel` in
    // `$lib/utils/phase` is keyed by them, so the page needs no server-only
    // import to render them.
    //
    // Deliberately *not* accompanied by what is actually switched on: that is
    // `enabled`/`alsoEnabled` on the manage page, where the switches are. Here
    // the plans are plain labels, so a participant reads what a phase is for
    // without being shown a discrepancy only an organiser can act on.
    capabilities: p.capabilities as number[],
    // The page a phase links to. `hackathon.get` nests the pages, so the link
    // needs no lookup of its own; only phases with a page get one.
    pageId: p.pageId ?? "",
  }))

  return { hackathonId: hackathon.id, phases }
}
