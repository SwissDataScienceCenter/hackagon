// Where a team stands with its submission, and which of those an organiser is
// looking at on Manage Submissions.
//
// Three standings, and every team is in exactly one: nothing filed yet, only
// drafts, or a final version — the team's actual entry. A final version with a
// newer draft on top of it is still `final`: the draft does not undo what the
// team already declared (see `submissionVersions`), so the row shows the draft
// as a note rather than moving the team back a step.
//
// Words rather than numbers, like `projectFilter`: this vocabulary appears in the
// address bar, where `?standing=draft` says what it means. Nothing here imports
// the generated enums, so a component may import this file.

/** Every standing, in the order the overview sorts them: the work first. */
export const SUBMISSION_STANDINGS = ["missing", "draft", "final"] as const

export type SubmissionStanding = (typeof SUBMISSION_STANDINGS)[number]

/** The tabs: every standing, plus all of them at once, which comes first. */
export const SUBMISSION_FILTERS = ["all", ...SUBMISSION_STANDINGS] as const

export type SubmissionFilter = (typeof SUBMISSION_FILTERS)[number]

/**
 * Where an address that names no filter lands: every team. Unlike the project
 * queue there is no one list that is "the line-up" here — the overview is the
 * point, and the sort already puts the teams that need chasing on top.
 */
export const DEFAULT_SUBMISSION_FILTER: SubmissionFilter = "all"

/** Tab labels. "Draft only", since a final team may hold drafts too. */
export const SUBMISSION_FILTER_LABEL: Record<SubmissionFilter, string> = {
  all: "All",
  missing: "No submission",
  draft: "Draft only",
  final: "Final",
}

/**
 * The filter a query parameter asks for, or `undefined` when it asks for
 * nothing recognizable. The caller applies `DEFAULT_SUBMISSION_FILTER`.
 */
export function submissionFilterFrom(
  raw: string | null | undefined,
): SubmissionFilter | undefined {
  return SUBMISSION_FILTERS.includes(raw as SubmissionFilter)
    ? (raw as SubmissionFilter)
    : undefined
}

/** The query string that reproduces a filter, leading `?` included. */
export function submissionFilterQuery(filter: SubmissionFilter): string {
  return `?standing=${filter}`
}

/** Whether a team with this standing belongs on this tab. */
export function inSubmissionFilter(
  standing: SubmissionStanding,
  filter: SubmissionFilter,
): boolean {
  return filter === "all" || standing === filter
}

/**
 * How many of these teams each tab would show.
 *
 * Handed the teams the tabs should count — every team, or only those matching
 * a search — so the same tabs can say "where are the teams" and "where are the
 * matches" without knowing which.
 */
export function submissionFilterCounts(
  standings: readonly SubmissionStanding[],
): Record<SubmissionFilter, number> {
  return Object.fromEntries(
    SUBMISSION_FILTERS.map((f) => [
      f,
      standings.filter((s) => inSubmissionFilter(s, f)).length,
    ]),
  ) as Record<SubmissionFilter, number>
}
