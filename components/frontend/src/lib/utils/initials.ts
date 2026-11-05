/**
 * Up to two letters standing in for an image a project, team or person lacks:
 * the first letter of each word, upper-cased.
 *
 * One rule for every round avatar that draws a name, so a project's row, its
 * detail page and the team working on it show the same two letters. An empty
 * name gives an empty string — the callers always draw the name beside it.
 *
 * Not `initialsOf` in `teamDistribution`: that builds a team's *name* from its
 * project and keeps every word, which is a different job.
 */
export function avatarInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
