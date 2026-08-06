/**
 * Display helpers for voting results.
 *
 * Deliberately free of generated types, unlike `$lib/server/hackathon/voting`,
 * so components can import them — `$lib/server/**` is server-only.
 */

/**
 * Ordinal for a placement — "1st", "2nd", "3rd", "11th".
 *
 * Positions are organizer-chosen integers rather than a list index, so nothing
 * guarantees they start at 1, run consecutively, or are even distinct — the
 * backend allows ties and `SuggestResults` produces them for equal scores. This
 * formats whatever it is given rather than assuming a well-formed podium.
 */
export function ordinal(position: number): string {
  // 11th, 12th, 13th are the exceptions to the -st/-nd/-rd rule, and they
  // recur every century (111th, 112th…), hence mod 100 rather than a literal.
  const teens = position % 100
  if (teens >= 11 && teens <= 13) return `${position}th`

  switch (position % 10) {
    case 1:
      return `${position}st`
    case 2:
      return `${position}nd`
    case 3:
      return `${position}rd`
    default:
      return `${position}th`
  }
}

/**
 * Medal for the top three placements, or undefined below that.
 *
 * Returned rather than rendered so the caller decides whether a podium is the
 * right metaphor — a category with eight placements is a leaderboard, and eight
 * rows where three have medals reads oddly.
 */
export function placementMedal(position: number): string | undefined {
  switch (position) {
    case 1:
      return "🥇"
    case 2:
      return "🥈"
    case 3:
      return "🥉"
    default:
      return undefined
  }
}
