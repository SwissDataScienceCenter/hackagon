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

// Every assignable role, in display order — drives both the badge list and
// the "grant a role the user doesn't hold yet" picker.
export const ASSIGNABLE_GLOBAL_ROLES = [1, 2]

export function globalRoleLabel(r: number): string | undefined {
  return LABEL[r]
}

export function globalRoleBadgeVariant(r: number): string | undefined {
  return BADGE_VARIANT[r]
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
