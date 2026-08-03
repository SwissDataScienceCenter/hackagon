// SubmissionStatus numeric values: UNSPECIFIED=0, DRAFT=1, FINAL=2
const LABEL: Partial<Record<number, string>> = {
  1: "Draft",
  2: "Final",
}
const BADGE_PRESET: Partial<Record<number, string>> = {
  1: "preset-tonal-warning",
  2: "preset-tonal-success",
}

export function submissionStatusLabel(s: number): string | undefined {
  return LABEL[s]
}

export function submissionStatusBadgePreset(s: number): string | undefined {
  return BADGE_PRESET[s]
}
