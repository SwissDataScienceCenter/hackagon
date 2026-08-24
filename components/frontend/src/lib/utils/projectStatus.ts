// How a project's status is shown, everywhere it is shown at all.
//
// **A badge marks the exception, not the norm.** A project awaiting review is
// badged; an approved project carries nothing. Approved is what a project is
// expected to be once an organiser has looked at it, and a label repeated on
// every row of an approved-only list says nothing — while "Proposed" is the one
// state that asks someone to act.
//
// So both lookups deliberately have **no entry for APPROVED**, and every caller
// already guards on the result being undefined. That is what makes the whole
// status vocabulary disappear by itself once a hackathon's queue is clear —
// including in a hackathon that never takes proposals at all, where nothing is
// ever pending. It needs no switch and no state to configure: the projects
// themselves say whether there is a distinction left to draw.
//
// ProjectStatus numeric values: UNSPECIFIED=0, PROPOSED=1, APPROVED=2
//
// Raw numbers rather than the generated enum: these lookups are imported by
// Svelte components, and `$lib/server/` is server-only. `Partial<Record<...>>`
// so an unrecognized value types as `string | undefined` instead of lying.
const LABEL: Partial<Record<number, string>> = {
  1: "Proposed",
}
const BADGE_VARIANT: Partial<Record<number, string>> = {
  1: "badge-warning",
}

/** The label for a status worth showing, or undefined when there is none. */
export function projectStatusLabel(s: number): string | undefined {
  return LABEL[s]
}

/** The badge variant to pair with `projectStatusLabel`, on the same terms. */
export function projectStatusBadgeVariant(s: number): string | undefined {
  return BADGE_VARIANT[s]
}
