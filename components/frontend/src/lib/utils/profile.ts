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

/** Longest description we accept, matched by the edit form's `maxlength`. */
export const DESCRIPTION_MAX_LENGTH = 2000
/** Longest affiliation we accept — one line next to a name, not a paragraph. */
export const AFFILIATION_MAX_LENGTH = 120
/** Generous, but bounded: a URL this long is a tracking blob, not a profile. */
export const URL_MAX_LENGTH = 500

export interface ProfileDraft {
  affiliation: string
  title: string
  description: string
  linkedinUrl: string
}

/**
 * Validates an edited profile, returning one message per bad field.
 *
 * Lives here rather than in the page so it outlives the mock: when
 * `UserService.Edit` lands, the form action calls this before the RPC and the
 * rules do not have to be rediscovered. Empty is always valid — every one of
 * these fields is optional, and clearing one is a legitimate edit.
 */
export function validateProfileDraft(
  draft: ProfileDraft,
): Partial<Record<keyof ProfileDraft, string>> {
  const errors: Partial<Record<keyof ProfileDraft, string>> = {}

  if (draft.affiliation.length > AFFILIATION_MAX_LENGTH) {
    errors.affiliation = `Affiliation must be ${AFFILIATION_MAX_LENGTH} characters or fewer`
  }
  if (draft.title.length > AFFILIATION_MAX_LENGTH) {
    errors.title = `Title must be ${AFFILIATION_MAX_LENGTH} characters or fewer`
  }
  if (draft.description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`
  }
  if (draft.linkedinUrl !== "") {
    if (draft.linkedinUrl.length > URL_MAX_LENGTH) {
      errors.linkedinUrl = `Link must be ${URL_MAX_LENGTH} characters or fewer`
    } else if (!isHttpUrl(draft.linkedinUrl)) {
      errors.linkedinUrl = "Enter a full URL starting with https://"
    }
  }

  return errors
}

/**
 * Whether a string is a URL the browser will treat as a link.
 *
 * Scheme-checked rather than pattern-matched, and only http(s): the value ends
 * up in an `href`, so allowing arbitrary schemes here would put `javascript:`
 * one step from a rendered link. The profile page renders it with
 * rel="noopener noreferrer" besides, but the scheme is the part worth refusing.
 */
function isHttpUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:"
}
