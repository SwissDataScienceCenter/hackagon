import { redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { loginUrlFor } from "$lib/utils/returnTo"

// Every authenticated route lives under (app), so this load is the single choke
// point for "you must be signed in". hooks.server.ts already guards by path
// pattern; this guards by route group, so a new route added here cannot leak
// through a gap in PUBLIC_ROUTE_PATTERNS. It also lets page loads below this
// point rely on event.locals.grpc being set.
//
// It makes no RPC of its own. The shell is a top bar showing identity and
// nothing else — the platform entry it used to carry now lives on the dashboard
// — and the roles below are already on locals. The hackathon list and page list
// this used to fetch belonged to the sidebar that lived here; that sidebar now
// renders under my/hackathon/[id], which loads its own.
export const load: LayoutServerLoad = async (event) => {
  // Same target and same parked value as hooks.server.ts:redirectToLogin —
  // through the same helper, because two guards that disagree about where login
  // lives is how a deep link gets lost on exactly one of the two paths.
  if (!event.locals.grpc) {
    redirect(303, loginUrlFor(event.url.pathname + event.url.search))
  }

  // Global roles come from casbin via WhoAmI, already on locals — no extra RPC.
  const roles = event.locals.platformUser?.roles ?? []

  return {
    session: event.locals.session,
    // The raw set as well as the two flags: the flags answer "may they?" and
    // gate what is offered, while the dashboard shows the roles themselves as
    // badges and would otherwise have to translate booleans back into a list —
    // and silently miss any role a later backend adds.
    globalRoles: roles,
    isGlobalAdmin: roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN),
    isHackathonOrganizer: roles.includes(
      GlobalRole.GLOBAL_ROLE_HACKATHON_ORGANIZER,
    ),
  }
}
