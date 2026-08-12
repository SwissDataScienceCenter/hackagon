const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * How long until `target`, as a line to put beside a heading — or null once it
 * has passed.
 *
 * Two units at most, and never a unit that is zero: "3 days" rather than
 * "3 days 0 h", "5 h 12 min" rather than "0 days 5 h 12 min". Below a minute
 * there is nothing useful to count, so it says so in words instead of ticking
 * seconds down — a hackathon boundary is not a launch clock, and a per-second
 * tick would mean re-rendering the card sixty times a minute to say the same
 * thing.
 *
 * `now` is a parameter rather than read from the clock, both so this is testable
 * and because the caller owns *when* it recomputes: see `Countdown.svelte`,
 * which deliberately has no value at all until it has mounted.
 */
export function formatCountdown(target: Date, now: Date): string | null {
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) return null

  const unit = (n: number, name: string) => `${n} ${name}${n === 1 ? "" : "s"}`

  if (ms >= DAY) {
    const days = Math.floor(ms / DAY)
    const hours = Math.floor((ms % DAY) / HOUR)
    return hours > 0 ? `${unit(days, "day")} ${hours} h` : unit(days, "day")
  }
  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR)
    const minutes = Math.floor((ms % HOUR) / MINUTE)
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
  }
  const minutes = Math.floor(ms / MINUTE)

  return minutes >= 1 ? `${minutes} min` : "less than a minute"
}

/** The verb that goes with a boundary, and the moment it falls. */
export type Boundary = { verb: "ends" | "starts"; target: Date }

/**
 * The next moment the hackathon changes shape, from the current and next phase.
 *
 * The current phase ending is the boundary that matters while it is running,
 * because that is when what participants may do can change. Once it has ended —
 * which happens routinely, since a declared phase stays current until an
 * organizer moves the pointer — the next phase starting is the only boundary
 * left to name, so this falls through to it rather than reporting nothing.
 *
 * Null when neither date is in the future: a hackathon with no dates set, or one
 * whose last phase has run out. Both are states the card renders without a
 * countdown rather than with an invented one.
 */
export function nextBoundary(
  current: { endsAt?: Date | undefined } | null,
  next: { startsAt?: Date | undefined } | null,
  now: Date,
): Boundary | null {
  if (current?.endsAt && current.endsAt > now) {
    return { verb: "ends", target: current.endsAt }
  }
  if (next?.startsAt && next.startsAt > now) {
    return { verb: "starts", target: next.startsAt }
  }

  return null
}
