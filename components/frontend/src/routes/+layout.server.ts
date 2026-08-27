import type { LayoutServerLoad } from "./$types"

export const load: LayoutServerLoad = async (event) => {
  // Both halves, for every route: the shells in (public) and (app) render the
  // same NavBar, and it needs to tell an anonymous visitor from one whose
  // session died. See `$lib/server/session`.
  return {
    session: event.locals.session,
    sessionExpired: event.locals.sessionExpired ?? false,
  }
}
