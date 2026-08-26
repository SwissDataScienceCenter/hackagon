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

const FINISHED = 3

/**
 * Whether the hackathon is over. `Join` refuses these outright with
 * `FailedPrecondition` (`hackathon_service.go:252`) whatever the registration
 * capability says, which makes this the one join refusal the dashboard can see
 * coming — `status` is computed server-side and rides on every `List` entry.
 */
export function isFinished(s: number): boolean {
  return s === FINISHED
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

/**
 * Whether a hackathon is private — the one visibility question anything other
 * than a badge asks.
 *
 * Here rather than as a `const PRIVATE = 2` beside each caller, which is what
 * the edit form used to carry: the number is generated (`Visibility` in
 * `$lib/server/grpc/generated`), and a `.svelte` file cannot import it, so the
 * literal has to live somewhere client-safe. Somewhere, not everywhere.
 */
export function isPrivate(v: number): boolean {
  return v === 2
}

// The membership chip helpers that used to sit here live in hackathonRole.ts,
// beside the other rules that read a viewer's role in a hackathon. This file is
// about the hackathon's own status and visibility.
