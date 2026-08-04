// ProjectStatus numeric values: UNSPECIFIED=0, PROPOSED=1, APPROVED=2
//
// Raw numbers rather than the generated enum: these lookups are imported by
// Svelte components, and `$lib/server/` is server-only. `Partial<Record<...>>`
// so an unrecognized value types as `string | undefined` instead of lying.
const LABEL: Partial<Record<number, string>> = {
  1: "Proposed",
  2: "Approved",
}
const BADGE_PRESET: Partial<Record<number, string>> = {
  1: "preset-tonal-warning",
  2: "preset-tonal-success",
}

export function projectStatusLabel(s: number): string | undefined {
  return LABEL[s]
}

export function projectStatusBadgePreset(s: number): string | undefined {
  return BADGE_PRESET[s]
}
