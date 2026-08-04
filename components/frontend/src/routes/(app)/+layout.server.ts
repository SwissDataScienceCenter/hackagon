import { redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"

// Every authenticated route lives under (app), so this load is the single choke
// point for "you must be signed in". hooks.server.ts already guards by path
// pattern; this guards by route group, so a new route added here cannot leak
// through a gap in PUBLIC_ROUTE_PATTERNS. It also lets page loads below this
// point rely on event.locals.grpc being set.
export const load: LayoutServerLoad = async (event) => {
  if (!event.locals.grpc) {
    const returnTo = encodeURIComponent(event.url.pathname + event.url.search)
    redirect(303, `/?returnTo=${returnTo}`)
  }

  const { hackathon } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser?.id

  // The sidebar is app-shell chrome for every authenticated route, so a backend
  // hiccup must degrade it to an empty nav rather than fail this load and blank
  // the whole shell (logo and user footer along with it).
  //
  // TODO(backend: enroll creator as participant): this filter is membership, not
  // ownership, so a hackathon the viewer created is absent until Create writes
  // the Participant row. Its section heading then falls back to "Hackathon",
  // having no name to read. Once the backend lands, this needs no change.
  let myHackathons: Awaited<ReturnType<typeof hackathon.list>>["hackathons"] =
    []
  if (participantId) {
    try {
      const result = await hackathon.list({ participantId })
      myHackathons = result.hackathons
    } catch (err) {
      event.locals.logger.warn(
        { err },
        "LAYOUT: sidebar hackathon list failed, rendering an empty nav",
      )
    }
  }

  // Global roles come from casbin via WhoAmI, already on locals — no extra RPC.
  const roles = event.locals.platformUser?.roles ?? []

  return {
    session: event.locals.session,
    myHackathons,
    isGlobalAdmin: roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN),
    isHackathonOrganizer: roles.includes(
      GlobalRole.GLOBAL_ROLE_HACKATHON_ORGANIZER,
    ),
  }
}
