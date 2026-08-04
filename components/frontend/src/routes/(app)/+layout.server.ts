import { redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mockUserProfile } from "$lib/mocks/userProfiles"

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

  const { hackathon, page } = requireGrpc(event.locals.grpc)
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

  // The sidebar lists the active hackathon's content pages, but this layout sits
  // above my/hackathon/[id]'s own load and cannot reach its data. A shallow
  // PageService.List is cheaper than repeating that layout's hackathon.get, and
  // it is the authoritative source besides: hackathon.get returns pages with
  // `visible: false` to plain members, while List filters them out server-side.
  //
  // Errors are swallowed for the same reason as myHackathons above — an
  // unreadable hackathon shows an empty page list, and the nested layout is what
  // reports the real 403/404 for the content area.
  //
  // Only fetched when the URL names a hackathon, so this costs nothing on the
  // dashboard or the admin routes. The consequence: where the sidebar falls back
  // to showing a default hackathon's nav, that hackathon's content pages are
  // absent until you actually navigate into it. Worth it — the alternative is an
  // extra RPC on every authenticated route to decorate chrome.
  let hackathonPages: { id: string; title: string }[] = []
  if (event.params.id) {
    try {
      const { pages } = await page.list({ hackathonId: event.params.id })
      hackathonPages = pages.map((p) => ({ id: p.id, title: p.title }))
    } catch (err) {
      event.locals.logger.warn(
        { err },
        "LAYOUT: sidebar page list failed, rendering the nav without content pages",
      )
    }
  }

  // Global roles come from casbin via WhoAmI, already on locals — no extra RPC.
  const roles = event.locals.platformUser?.roles ?? []

  // The sidebar's user panel. Undefined when WhoAmI failed, in which case the
  // panel falls back to the session name and stops linking to /profile — that
  // page needs the platform user and would only 503.
  //
  // TODO(backend: user-profile-fields): `subtitle` is placeholder copy from
  // $lib/mocks/userProfiles. Title is preferred over affiliation because the
  // panel has one narrow line, and "Research Engineer" identifies someone more
  // usefully than their institution does.
  const me = event.locals.platformUser
  const mock = mockUserProfile(me?.username)
  const viewer = me
    ? {
        username: me.username,
        displayName: me.displayName,
        roles: me.roles,
        subtitle: mock?.title ?? mock?.affiliation,
      }
    : undefined

  return {
    session: event.locals.session,
    myHackathons,
    hackathonPages,
    viewer,
    isGlobalAdmin: roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN),
    isHackathonOrganizer: roles.includes(
      GlobalRole.GLOBAL_ROLE_HACKATHON_ORGANIZER,
    ),
  }
}
