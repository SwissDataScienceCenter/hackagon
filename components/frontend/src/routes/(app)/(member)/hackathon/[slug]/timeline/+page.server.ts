import type { PageServerLoad } from "./$types"
import { activePhase, orderedPhases, phaseStatus } from "$lib/utils/phase"
import { capabilitiesByPhase, capabilityNoun } from "$lib/utils/capabilities"

export const load: PageServerLoad = async (event) => {
  const { hackathon, capabilities } = await event.parent()

  const ordered = orderedPhases(hackathon.phases)

  // Selection lives in `?phase=` rather than component state so a phase's
  // content is linkable and bookmarkable. An absent or unrecognized id falls
  // back to where the hackathon actually is right now.
  const requested = event.url.searchParams.get("phase")
  const selectedId =
    ordered.find((p) => p.id === requested)?.id ??
    activePhase(ordered, hackathon.currentPhaseId)?.phase.id ??
    ordered[0]?.id

  const selected = ordered.find((p) => p.id === selectedId)

  // A phase links to at most one page (O2O on both sides), so there is nothing
  // to disambiguate. `hackathon.get` returns hidden pages too, so filtering on
  // `visible` is ours to do — same as pages/[pageId] does. That is UX, not
  // enforcement: the content ships in the response either way.
  const linked = selected?.pageId
    ? hackathon.pages.find((p) => p.id === selected.pageId && p.visible)
    : undefined

  // What each phase turns on and off, resolved to member-facing nouns here so
  // the component renders strings rather than reasoning about capabilities.
  // A phase with neither gets empty lists and shows nothing.
  const unlocks = capabilitiesByPhase(capabilities)

  const phases = ordered.map((p) => {
    const forPhase = unlocks.get(p.id)

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      status: phaseStatus(p.startsAt, p.endsAt),
      opens: (forPhase?.opens ?? []).map(capabilityNoun),
      closes: (forPhase?.closes ?? []).map(capabilityNoun),
    }
  })

  return {
    phases,
    selectedId,
    linkedPage: linked
      ? { id: linked.id, title: linked.title, content: linked.content }
      : null,
  }
}
