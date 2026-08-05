import { redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"
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

  // Global roles drive which entries the account menu shows. They are the
  // backend's own answer (casbin g2, surfaced by WhoAmI), not a client guess —
  // every page behind them enforces independently, so this only avoids
  // offering doors that will not open.
  const roles = event.locals.platformUser?.roles ?? []

  return {
    session: event.locals.session,
    isAdmin: roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN),
    canCreateHackathon:
      roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN) ||
      roles.includes(GlobalRole.GLOBAL_ROLE_HACKATHON_ORGANIZER),
  }
}
