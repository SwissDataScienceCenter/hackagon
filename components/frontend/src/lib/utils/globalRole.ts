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

// Every assignable role, in display order — drives the badges, the role filter
// and the choices on a user's page.
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
  // "None" rather than "No role": the chip sits in a row labeled "Platform
  // role", and nearly everyone holds a role somewhere — owner or member of a
  // hackathon. Same word the user page uses for the choice.
  if (filter === "none") return "None"
  return globalRoleLabel(filter) ?? "Unknown"
}

/**
 * Whether a user holding `roles` belongs in the slice.
 *
 * "none" means an empty role list — exactly the rows whose role column shows a
 * dash. A user holding only a role this build cannot name is therefore not in
 * it: their row shows an "Unknown" badge, and they appear under "all" only.
 */
export function matchesGlobalRoleFilter(
  roles: number[],
  filter: GlobalRoleFilter,
): boolean {
  if (filter === "all") return true
  if (filter === "none") return roles.length === 0
  return roles.includes(filter)
}

/** Named because granting it asks for more than any other change does. */
export const ADMIN_ROLE = 1

/**
 * The choice of holding none of the assignable roles. GlobalRole has no such
 * value; 0 is UNSPECIFIED, which is never granted, so it is free to mean this.
 */
export const NO_PLATFORM_ROLE = 0

/**
 * What the user detail page offers, least power first, so the list reads as a
 * ladder and Admin — the one that hands over every hackathon — sits at the end.
 */
export const PLATFORM_ROLE_CHOICES = [NO_PLATFORM_ROLE, 2, ADMIN_ROLE]

export function platformRoleChoiceLabel(choice: number): string {
  if (choice === NO_PLATFORM_ROLE) return "None"
  return globalRoleLabel(choice) ?? "Unknown"
}

/**
 * The choice a user's current roles amount to, or `undefined` when they hold
 * both assignable roles — representable through the API, never granted by this
 * UI, and not something one radio can show.
 *
 * Roles this build cannot name are ignored: they are not among the choices, so
 * they can neither be shown as the current one nor changed from here.
 */
export function currentPlatformRole(roles: number[]): number | undefined {
  const held = ASSIGNABLE_GLOBAL_ROLES.filter((r) => roles.includes(r))
  if (held.length === 0) return NO_PLATFORM_ROLE
  if (held.length === 1) return held[0]
  return undefined
}

/**
 * The calls that leave a user holding exactly `target` among the assignable
 * roles. The backend has no "set role", only AddRole and RemoveRole, so a switch
 * is two calls and cannot be atomic.
 *
 * The caller must run `revoke` before `grant`. If the grant then fails, the user
 * is left holding less than before rather than both roles at once — the failure
 * that fails closed. Roles this build cannot name are left alone, for the same
 * reason `currentPlatformRole` ignores them.
 */
export function planPlatformRoleChange(
  current: number[],
  target: number,
): { revoke: number[]; grant: number | undefined } {
  return {
    revoke: ASSIGNABLE_GLOBAL_ROLES.filter(
      (r) => r !== target && current.includes(r),
    ),
    grant:
      target !== NO_PLATFORM_ROLE && !current.includes(target)
        ? target
        : undefined,
  }
}
