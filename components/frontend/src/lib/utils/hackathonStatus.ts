// HackathonStatus numeric values: PENDING=1, ACTIVE=2, FINISHED=3
const LABEL: Partial<Record<number, string>> = {
  1: "Upcoming",
  2: "Active",
  3: "Finished",
}
const BADGE_PRESET: Partial<Record<number, string>> = {
  1: "preset-tonal-warning",
  2: "preset-tonal-primary",
  3: "preset-outlined-surface-200-800",
}

export function statusLabel(s: number): string | undefined {
  return LABEL[s]
}

export function statusBadgePreset(s: number): string | undefined {
  return BADGE_PRESET[s]
}

// Visibility numeric values: PUBLIC=1, PRIVATE=2
const VISIBILITY_LABEL: Partial<Record<number, string>> = {
  1: "Public",
  2: "Private",
}
const VISIBILITY_PRESET: Partial<Record<number, string>> = {
  1: "preset-tonal-tertiary",
  2: "preset-tonal-error",
}

export function visibilityLabel(v: number): string | undefined {
  return VISIBILITY_LABEL[v]
}

export function visibilityBadgePreset(v: number): string | undefined {
  return VISIBILITY_PRESET[v]
}

// HackathonRole numeric values: UNSPECIFIED=0, OWNER=1, MEMBER=2
// is_waiting takes precedence over role for display purposes.
export function membershipBadgeLabel(isWaiting: boolean, role: number): string {
  if (isWaiting) return "Waitlisted"
  if (role === 1) return "Owner"
  return "Member"
}

export function membershipBadgePreset(isWaiting: boolean): string {
  return isWaiting ? "preset-tonal-warning" : "preset-tonal-success"
}
