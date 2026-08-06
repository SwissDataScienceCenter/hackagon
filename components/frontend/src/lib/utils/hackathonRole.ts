// Every rule that reads a viewer's role in one hackathon: what it is, what chip
// names it, and what it lets them do. Pairs with globalRole.ts, which does the
// same for the platform-wide roles.
//
// Kept apart from $lib/navigation/items so a server load can import a permission
// without pulling that module's icon imports in behind it, and so the numeric
// HackathonRole values are stated once rather than per call site.

/** The viewer's relationship to one hackathon, as `HackathonMember` reports it. */
export interface ViewerMembership {
  /** HackathonRole: UNSPECIFIED=0, OWNER=1, MEMBER=2. */
  role: number
  isWaiting: boolean
}

// OWNER is exported for `manageNav`, which gates on it directly. MEMBER has no
// caller outside this file — nothing else needs to distinguish a member from
// someone with no row, since every such rule reduces to owner-or-admin.
export const OWNER = 1
const MEMBER = 2

/**
 * Role chip for the hackathon section heading.
 *
 * This is the only role signal a participant gets — `manageNav` gives an owner a
 * labelled section of their own, but everyone else has just this chip — and it
 * must not imply capabilities that are not there. `isWaiting` wins over `role`
 * because a waitlisted user is not yet a member in any useful sense. Global
 * admins can manage any hackathon without joining it, so they get a badge even
 * with no membership row.
 */
export function hackathonRoleBadge(
  membership: ViewerMembership | undefined,
  isGlobalAdmin: boolean,
): string | undefined {
  if (membership?.isWaiting) return "Waitlisted"
  if (membership?.role === OWNER) return "Owner"
  if (isGlobalAdmin) return "Admin"
  if (membership?.role === MEMBER) return "Member"

  return undefined
}

/**
 * Whether the viewer may edit a hackathon's own fields (name, description,
 * visibility, dates, logo) — the backend's `hackathon:write`, held by the
 * confirmed owner (a waitlisted owner does not count, same rule
 * `hackathonRoleBadge` applies) and, via the admin escape hatch, by a global
 * admin. Shared by the dashboard (to show the edit pencil) and the edit
 * route's own load (to guard it), so the two can never disagree about who is
 * let in.
 */
export function canEditHackathon(
  membership: ViewerMembership | undefined,
  isGlobalAdmin: boolean,
): boolean {
  if (isGlobalAdmin) return true

  return membership?.role === OWNER && !membership.isWaiting
}

/**
 * Whether the viewer may open a hackathon's member view at all — the backend's
 * `hackathon:read`, which `/my/hackathon/[id]`'s layout needs before it can
 * render anything.
 *
 * Casbin grants that row to `owner` and `member` within one hackathon
 * (`rbac.go:176`, `:198`) and to a global admin through the escape hatch. Two
 * things it pointedly does *not* do:
 *
 *  - **grant it on visibility.** `AllowPublicHackathonAccess` exists and is
 *    never called, so a public hackathon is no more readable to a non-member
 *    than a private one — see `TODO(backend: public-hackathon-read)`.
 *  - **grant it on joining.** `Join` writes only the Participant row; the
 *    `member` role arrives with `ApproveParticipant`
 *    (`hackathon_service.go:373`). So a waitlisted user is listed as connected
 *    to the hackathon and still cannot read it.
 *
 * Which is what makes this the rule for whether a dashboard row is a link at
 * all: without it every "Other hackathons" row, and every row you have only
 * just joined, navigates straight into a 403.
 */
export function canOpenHackathon(
  membership: ViewerMembership | undefined,
  isGlobalAdmin: boolean,
): boolean {
  if (isGlobalAdmin) return true

  return membership !== undefined && !membership.isWaiting
}

/**
 * Membership chip for a hackathon *row* — the dashboard's list and the `[id]`
 * layout hero.
 *
 * Deliberately not `hackathonRoleBadge`, though the two share a precedence.
 * This one is only ever rendered where a membership row is already known to
 * exist, so it always returns a string and names no global role: on the
 * dashboard, "Admin" would appear against every hackathon on the platform and
 * say nothing about this one. `hackathonRoleBadge` labels a *section heading*
 * inside one hackathon, where the admin escape hatch is exactly what explains
 * why the viewer can act, and where no relationship at all must produce no chip.
 *
 * Keep the shared part in step: `isWaiting` outranks `role` in both, because a
 * waitlisted user is not yet a member in any useful sense.
 */
export function membershipBadgeLabel(isWaiting: boolean, role: number): string {
  if (isWaiting) return "Waitlisted"
  if (role === OWNER) return "Owner"

  return "Member"
}

export function membershipBadgeVariant(isWaiting: boolean): string {
  return isWaiting ? "badge-warning" : "badge-success"
}
