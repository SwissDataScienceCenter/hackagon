// ProjectStatus numeric values: UNSPECIFIED=0, PROPOSED=1, APPROVED=2
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
