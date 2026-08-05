import { redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"

// Every authenticated route lives under (app), so this load is the single choke
// point for "you must be signed in". hooks.server.ts already guards by path
// pattern; this guards by route group, so a new route added here cannot leak
// through a gap in PUBLIC_ROUTE_PATTERNS. It also lets page loads below this
// point rely on event.locals.grpc being set.
//
// It makes no RPC of its own. The shell is a top bar showing identity and, for
// an admin, the platform entry — both already on locals. The hackathon list and
// page list this used to fetch belonged to the sidebar that lived here; that
// sidebar now renders under my/hackathon/[id], which loads its own.
export const load: LayoutServerLoad = async (event) => {
  if (!event.locals.grpc) {
    const returnTo = encodeURIComponent(event.url.pathname + event.url.search)
    redirect(303, `/?returnTo=${returnTo}`)
  }

  // Global roles come from casbin via WhoAmI, already on locals — no extra RPC.
  const roles = event.locals.platformUser?.roles ?? []

  return {
    session: event.locals.session,
    isGlobalAdmin: roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN),
    isHackathonOrganizer: roles.includes(
      GlobalRole.GLOBAL_ROLE_HACKATHON_ORGANIZER,
    ),
  }
}
