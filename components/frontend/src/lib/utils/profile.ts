// GlobalRole numeric values: UNSPECIFIED=0, ADMIN=1, HACKATHON_ORGANIZER=2.
//
// Raw numbers rather than the generated enum: these lookups are imported by
// Svelte components, and `$lib/server/` is server-only. `Partial<Record<...>>`
// so an unrecognized value types as `string | undefined` instead of lying.
const GLOBAL_ROLE_LABEL: Partial<Record<number, string>> = {
  1: "Admin",
  2: "Organiser",
}

const GLOBAL_ROLE_BADGE_PRESET: Partial<Record<number, string>> = {
  1: "preset-tonal-tertiary",
  2: "preset-tonal-primary",
}

export function globalRoleLabel(role: number): string | undefined {
  return GLOBAL_ROLE_LABEL[role]
}

export function globalRoleBadgePreset(role: number): string | undefined {
  return GLOBAL_ROLE_BADGE_PRESET[role]
}

/**
 * The viewer's global roles as renderable badges, unknown values dropped.
 *
 * Dropped rather than labelled "Unknown": an unrecognized role number means the
 * backend gained a role this build has no name for, and a badge reading
 * "Unknown" next to someone's name is worse than no badge at all.
 */
export function globalRoleBadges(
  roles: number[],
): { label: string; preset: string }[] {
  return roles.flatMap((role) => {
    const label = globalRoleLabel(role)
    if (!label) return []

    return [
      { label, preset: globalRoleBadgePreset(role) ?? "preset-tonal-surface" },
    ]
  })
}

/**
 * Up to two initials for an avatar fallback.
 *
 * Keycloak may leave display_name empty, hence the username fallback; '?' covers
 * both being blank, so the avatar is never an empty circle that reads as a
 * rendering fault. Same rule as the users table used inline before this existed.
 */
export function profileInitials(
  displayName: string | undefined,
  username: string | undefined,
): string {
  const source = (displayName ?? "").trim() || (username ?? "").trim()
  const letters = source
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return letters || "?"
}

/** Display name with the same username fallback the initials use. */
export function profileDisplayName(
  displayName: string | undefined,
  username: string | undefined,
): string {
  return (displayName ?? "").trim() || (username ?? "").trim() || "Unknown user"
}
