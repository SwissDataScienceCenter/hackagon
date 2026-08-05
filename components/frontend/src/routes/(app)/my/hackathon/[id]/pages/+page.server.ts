import type { PageServerLoad } from "./$types"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePages } from "$lib/server/hackathon/capabilities"
import { error } from "@sveltejs/kit"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the pages,
  // unfiltered — same source Timeline's list uses for phases.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManagePages(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can manage pages")
  }

  // The phase (if any) each page is linked from, for display only — the link
  // itself is set on the phase's own edit form, not here.
  const phaseTitleByPageId = new Map(
    hackathon.phases
      .filter((p) => p.pageId)
      .map((p) => [p.pageId as string, p.name]),
  )

  // `hackathon.get` nests pages in whatever order ent returned them, not
  // `order` — unlike `PageService.List`, which sorts server-side. Sorting here
  // is what makes the list mean anything, since `order` is exactly what
  // MoveUp/MoveDown/SetOrder exist to control.
  const pages = [...hackathon.pages]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      id: p.id,
      title: p.title,
      visible: p.visible,
      phaseName: phaseTitleByPageId.get(p.id),
    }))

  return { hackathonId: hackathon.id, pages }
}
