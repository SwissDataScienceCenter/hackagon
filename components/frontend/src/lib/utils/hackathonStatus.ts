// HackathonStatus numeric values: PENDING=1, ACTIVE=2, FINISHED=3
const LABEL: Partial<Record<number, string>> = {
  1: "Upcoming",
  2: "Active",
  3: "Finished",
}
const BADGE_VARIANT: Partial<Record<number, string>> = {
  1: "badge-warning",
  2: "badge-accent",
  3: "badge-neutral",
}

export function statusLabel(s: number): string | undefined {
  return LABEL[s]
}

export function statusBadgeVariant(s: number): string | undefined {
  return BADGE_VARIANT[s]
}

// Visibility numeric values: PUBLIC=1, PRIVATE=2
const VISIBILITY_LABEL: Partial<Record<number, string>> = {
  1: "Public",
  2: "Private",
}
const VISIBILITY_VARIANT: Partial<Record<number, string>> = {
  1: "badge-info",
  2: "badge-danger",
}

export function visibilityLabel(v: number): string | undefined {
  return VISIBILITY_LABEL[v]
}

export function visibilityBadgeVariant(v: number): string | undefined {
  return VISIBILITY_VARIANT[v]
}

// HackathonRole numeric values: UNSPECIFIED=0, OWNER=1, MEMBER=2
// is_waiting takes precedence over role for display purposes.
export function membershipBadgeLabel(isWaiting: boolean, role: number): string {
  if (isWaiting) return "Waitlisted"
  if (role === 1) return "Owner"
  return "Member"
}

export function membershipBadgeVariant(isWaiting: boolean): string {
  return isWaiting ? "badge-warning" : "badge-success"
}
