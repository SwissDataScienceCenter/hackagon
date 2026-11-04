// GlobalRole numeric values: UNSPECIFIED=0, ADMIN=1, HACKATHON_ORGANIZER=2
//
// See projectStatus.ts for why these are raw numbers, not the generated enum.
const LABEL: Partial<Record<number, string>> = {
  1: "Admin",
  2: "Hackathon Organizer",
}
const BADGE_VARIANT: Partial<Record<number, string>> = {
  1: "badge-accent",
  2: "badge-neutral",
}

// What each role actually carries, read off the casbin policy rather than
// inferred from the name: `admin` has no policy rows at all, because the matcher
// ends in `|| g2(r.sub, "admin")` and short-circuits every check in every
// hackathon, while `hackathon_organizer` carries exactly one row,
// hackathon:create. See components/backend/internal/middleware/rbac.go.
//
// Terse on purpose. The same string labels an <option> in the role picker and
// carries the legend on the users page, so it has to survive one line of a
// native select popup.
const DESCRIPTION: Partial<Record<number, string>> = {
  1: "Full access to every hackathon, and to this page",
  2: "Can create hackathons, nothing more",
}

// Every assignable role, in display order — drives both the badge list and
// the "grant a role the user doesn't hold yet" picker.
export const ASSIGNABLE_GLOBAL_ROLES = [1, 2]

export function globalRoleLabel(r: number): string | undefined {
  return LABEL[r]
}

export function globalRoleBadgeVariant(r: number): string | undefined {
  return BADGE_VARIANT[r]
}

export function globalRoleDescription(r: number): string | undefined {
  return DESCRIPTION[r]
}

/**
 * The roles worth showing a viewer about themselves, in a fixed order.
 *
 * Filtering by `ASSIGNABLE_GLOBAL_ROLES` rather than by `roles` does two things
 * at once: it drops anything this build has no label for — UNSPECIFIED, or a
 * role a newer backend grants — and it pins the order, so the badges cannot
 * reshuffle because casbin returned the same set in a different sequence.
 *
 * Deliberately not what the admin user table uses: there, an unrecognized role
 * is worth surfacing as "Unknown" because the point of the table is auditing
 * who holds what. Telling someone they hold a role this build cannot name is
 * just noise.
 */
export function displayableGlobalRoles(roles: number[]): number[] {
  return ASSIGNABLE_GLOBAL_ROLES.filter((r) => roles.includes(r))
}

/**
 * One slice of the admin user table: everyone, the holders of one role, or the
 * users holding no role at all.
 *
 * Single-valued because the roles are mutually exclusive (see the users page),
 * so a multi-select would only ever add slices together.
 */
export type GlobalRoleFilter = "all" | "none" | number

/** Every slice, in the order the filter shows them. */
export const GLOBAL_ROLE_FILTERS: GlobalRoleFilter[] = [
  "all",
  ...ASSIGNABLE_GLOBAL_ROLES,
  "none",
]

export function globalRoleFilterLabel(filter: GlobalRoleFilter): string {
  if (filter === "all") return "All"
  // "platform", because nearly everyone holds a role somewhere: owner or member
  // of a hackathon. Those are per-hackathon and not what this filter reads.
  if (filter === "none") return "No platform role"
  return globalRoleLabel(filter) ?? "Unknown"
}

/**
 * Whether a user holding `roles` belongs in the slice.
 *
 * "none" means an empty role list — the same test the users page uses to decide
 * a row gets the grant picker, so the slice is exactly the rows showing one. A
 * user holding only a role this build cannot name is therefore not in it: their
 * row shows an "Unknown" badge, not a picker, and they appear under "all" only.
 */
export function matchesGlobalRoleFilter(
  roles: number[],
  filter: GlobalRoleFilter,
): boolean {
  if (filter === "all") return true
  if (filter === "none") return roles.length === 0
  return roles.includes(filter)
}
