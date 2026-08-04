import type { PageServerLoad } from "./$types"
import { membershipBadgeLabel } from "$lib/utils/hackathonStatus"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // participant with their casbin role and waitlist flag.
  const { hackathon, isGlobalAdmin } = await event.parent()

  // Waitlisted members are listed too, carrying a "Waitlisted" label. They are
  // real rows in the hackathon's membership, and the label says which is which
  // — hiding them would make the page disagree with the count in the header.
  const participants = hackathon.members
    .filter((m) => m.user !== undefined)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
      roleLabel: membershipBadgeLabel(m.isWaiting, m.role),
    }))

  // /people/[userId] calls UserService.Get, which requires `user:read` — a
  // permission only the Admin global role holds (rbac.go has no policy row for
  // the `user` object). Linking a plain member there would hand them a 403, so
  // only an admin gets the link; for everyone else the card's View stays the
  // inert anchor it already was.
  //
  // TODO(backend: profile read access): once co-participants may read each
  // other's profiles, drop this flag and always link.
  return { participants, canViewProfiles: isGlobalAdmin }
}
