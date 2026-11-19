/**
 * The time zone a hackathon's start and end are entered and edited in.
 *
 * Named rather than left to the runtime: the form actions that read these
 * times run on the server, whose clock is UTC in the cluster, and `new Date()`
 * on a bare `YYYY-MM-DDTHH:mm` reads it in that clock. A date-only value was
 * worse — it parsed as 00:00 UTC, so a hackathon ended at 01:00 Zurich time on
 * its own last day. Every hackathon so far is run from Zurich; a per-hackathon
 * zone is a bigger change than this one.
 */
export const EVENT_TIME_ZONE = "Europe/Zurich"

const DATE_TIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** `d`'s wall-clock fields in `timeZone`. */
function wallClock(d: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d)
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value)

  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  }
}

/** How far `timeZone`'s clock is ahead of UTC at `instant`, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone)
  const wall = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)

  return wall - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * A `datetime-local` value (`YYYY-MM-DDTHH:mm`) read as a time in `timeZone`,
 * or `null` when it is not one.
 *
 * Two passes, because the offset to subtract is the one in force at the
 * *result*, which the first guess can miss by an hour when a daylight-saving
 * change lies between them. A time skipped in spring lands an hour later; a
 * time repeated in autumn resolves to one of its two occurrences.
 */
export function fromEventDateTime(
  value: string,
  timeZone: string = EVENT_TIME_ZONE,
): Date | null {
  const m = DATE_TIME_LOCAL.exec(value)
  if (!m) return null
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0] = m
    .slice(1)
    .map(Number)
  if (hour > 23 || minute > 59) return null

  const wall = Date.UTC(year, month - 1, day, hour, minute)
  const asDate = new Date(wall)
  if (asDate.getUTCMonth() !== month - 1 || asDate.getUTCDate() !== day) {
    return null
  }

  const guess = wall - offsetMs(new Date(wall), timeZone)

  return new Date(wall - offsetMs(new Date(guess), timeZone))
}

/**
 * An instant as `datetime-local` wants it, on `timeZone`'s clock — the inverse
 * of `fromEventDateTime`, so a form saved unchanged stores the same instant.
 */
export function toEventDateTime(
  d: Date | undefined,
  timeZone: string = EVENT_TIME_ZONE,
): string {
  if (!d) return ""
  const w = wallClock(new Date(d), timeZone)
  const pad = (n: number) => String(n).padStart(2, "0")

  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`
}

/**
 * A form field holding a hackathon start or end: `undefined` when left empty,
 * `null` when filled with something that is not a date and time.
 */
export function readEventDateTime(
  raw: FormDataEntryValue | null,
): Date | undefined | null {
  if (typeof raw !== "string" || raw.trim() === "") return undefined

  return fromEventDateTime(raw.trim())
}
