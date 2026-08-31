/**
 * How much of a project's description a list row carries.
 *
 * Lives here rather than in either loader because the participant list and the
 * organiser's review queue show the same projects: a row that says more on one
 * page than the other reads as two different descriptions of one project.
 *
 * Paired with `markdownExcerpt`, which flattens the markdown before cutting —
 * so this counts the characters someone reads, not the `##` and `**` they do
 * not.
 */
export const PROJECT_EXCERPT_CHARS = 100
