import type { PageServerLoad } from "./$types"
import { phaseStatus, sortPhasesByStart } from "$lib/utils/phase"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the phases.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )

  // Same ordering the header bar uses, so the two never disagree about the
  // sequence a participant is looking at.
  const phases = sortPhasesByStart(hackathon.phases).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    status: phaseStatus(p.startsAt, p.endsAt),
    // Raw enum numbers — `capabilityLabel` in `$lib/utils/phase` is keyed by
    // them, so the page needs no server-only import to render them.
    //
    // TODO(backend: phase-seed-gaps): empty in every seeded hackathon, because
    // `cmd/seed` omits the field on all three `Phase.Create` calls. Organizer-set
    // tags render; a fresh dev database shows none.
    capabilities: p.capabilities as number[],
  }))

  // TODO: a phase may link to a Page (`pageId`), and `hackathon.get` already
  // returns those pages with their content — but there is no participant-facing
  // page route to send anyone to, so the link is left out rather than rendered
  // dead. Nothing is missing on the backend side; this needs a
  // `my/hackathon/[id]/pages/[pageId]` route on ours.

  return {
    hackathonId: hackathon.id,
    phases,
    mayManage: mayManagePhases(myMembership ?? undefined, isAdmin),
  }
}
