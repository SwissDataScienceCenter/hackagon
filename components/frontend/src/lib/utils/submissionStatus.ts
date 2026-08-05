// SubmissionStatus numeric values: UNSPECIFIED=0, DRAFT=1, FINAL=2
//
// See projectStatus.ts for why these are raw numbers, not the generated enum.
const LABEL: Partial<Record<number, string>> = {
  1: "Draft",
  2: "Final",
}
const BADGE_VARIANT: Partial<Record<number, string>> = {
  1: "badge-warning",
  2: "badge-success",
}

export function submissionStatusLabel(s: number): string | undefined {
  return LABEL[s]
}

export function submissionStatusBadgeVariant(s: number): string | undefined {
  return BADGE_VARIANT[s]
}
