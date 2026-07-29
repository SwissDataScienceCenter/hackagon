import type { LayoutServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"

export const load: LayoutServerLoad = async (event) => {
  const { hackathon, page } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser?.id

  // The sidebar is app-shell chrome for every authenticated route, so a
  // backend hiccup must degrade it to an empty switcher rather than fail this
  // load and blank the whole shell (logo, nav and user footer along with it).
  let myHackathons: Awaited<ReturnType<typeof hackathon.list>>["hackathons"] =
    []
  if (participantId) {
    try {
      const result = await hackathon.list({ participantId })
      myHackathons = result.hackathons
    } catch {
      myHackathons = []
    }
  }

  // The sidebar nav needs the active hackathon's visible pages, but this
  // layout sits above hackathon/[slug]'s own load — fetch a shallow list
  // here rather than duplicating the full hackathon.get() that layout does.
  // Swallow errors so an inaccessible/invalid slug just shows an empty nav
  // instead of breaking the app shell (the nested layout reports the real
  // 403/404 for the content area).
  let hackathonPages: { id: string; title: string }[] = []
  if (event.params.slug) {
    try {
      const { pages } = await page.list({ hackathonId: event.params.slug })
      hackathonPages = pages
        .filter((p) => p.visible)
        .sort((a, b) => a.order - b.order)
        .map((p) => ({ id: p.id, title: p.title }))
    } catch {
      hackathonPages = []
    }
  }

  return {
    myHackathons,
    hackathonPages,
    isGlobalAdmin:
      event.locals.platformUser?.roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN) ??
      false,
  }
}
