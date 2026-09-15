// Where a hackathon sits relative to now, in words.
//
// The grouping comes from `status`, which the backend computes from the same two
// dates on every List entry (`computeHackathonStatus`, mappers.go) — recomputing
// it here would be a second implementation of the same rule, and the two would
// drift the moment one of them learned about, say, an explicit "closed" flag.
// Only the phrasing is worked out from the dates, because only the phrasing
// needs to know how far away they are.

/** PENDING=1, ACTIVE=2, FINISHED=3, matching HackathonStatus. */
export type WhenGroup = "upcoming" | "now" | "finished"

const GROUP: Partial<Record<number, WhenGroup>> = {
  1: "upcoming",
  2: "now",
  3: "finished",
}

export function whenGroup(status: number): WhenGroup | undefined {
  return GROUP[status]
}

const MS_PER_DAY = 86_400_000

/**
 * Whole days from `a` to `b`, counted by calendar day rather than by elapsed
 * time: something starting at 09:00 tomorrow "starts tomorrow" whether it is now
 * 08:00 or 23:00 today, which is not what a 24-hour division would say.
 */
function daysBetween(a: Date, b: Date): number {
  const dayA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const dayB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())

  return Math.round((dayB - dayA) / MS_PER_DAY)
}

function inDays(d: number): string {
  if (d <= 0) return "starts today"
  if (d === 1) return "starts tomorrow"
  if (d < 14) return `starts in ${d} days`

  return `starts in ${Math.round(d / 7)} weeks`
}

function agoDays(d: number): string {
  if (d <= 0) return "ended today"
  if (d === 1) return "ended yesterday"
  if (d < 14) return `ended ${d} days ago`

  return `ended ${Math.round(d / 7)} weeks ago`
}

/**
 * How far away this hackathon is, as a phrase to put in front of its dates.
 *
 * Undefined where there is nothing honest to say — a hackathon with no dates is
 * "Upcoming" for ever, because that is what the backend computes from two absent
 * fields, and inventing a countdown to a date nobody set would be worse than
 * saying nothing. The caller shows the bare range instead, and for an organiser
 * the missing phrase is itself the hint.
 */
export function relativeWhen(
  h: { status: number; startsAt?: Date; endsAt?: Date },
  now: Date | undefined,
): string | undefined {
  // `now` is optional, and absent is the server's answer.
  //
  // These phrases are counted in *local* calendar days, so rendering them during
  // SSR would count them in the container's timezone rather than the reader's: a
  // UTC server tells somebody in Zurich a hackathon starts "in 2 days" between
  // 22:00 and midnight, and the client then re-renders it to "tomorrow". Callers
  // fill `now` in on mount instead, so the phrase simply is not there until the
  // browser can say it — and the dates beside it, which are absolute, are.
  if (!now) return undefined

  const group = whenGroup(h.status)
  if (group === "upcoming") {
    return h.startsAt ? inDays(daysBetween(now, h.startsAt)) : undefined
  }
  if (group === "finished") {
    return h.endsAt ? agoDays(daysBetween(h.endsAt, now)) : undefined
  }
  if (group !== "now") return undefined

  // Running. "day 3 of 5" says both how far in and how long it lasts, which two
  // separate phrases would take twice the room to say.
  if (!h.startsAt) return "happening now"
  if (!h.endsAt) return "happening now"
  const total = daysBetween(h.startsAt, h.endsAt) + 1
  const day = Math.min(daysBetween(h.startsAt, now) + 1, total)

  return total > 1 ? `day ${day} of ${total}` : "happening today"
}
