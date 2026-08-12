import { describe, it, expect } from "vitest"
import { formatCountdown, nextBoundary } from "./relativeTime"

const NOW = new Date("2026-08-11T12:00:00Z")
const at = (iso: string) => new Date(iso)

describe("formatCountdown", () => {
  it("gives days and hours", () => {
    expect(formatCountdown(at("2026-08-14T02:00:00Z"), NOW)).toBe("2 days 14 h")
  })

  it("drops the hours when they are zero", () => {
    expect(formatCountdown(at("2026-08-14T12:00:00Z"), NOW)).toBe("3 days")
  })

  it("says one day in the singular", () => {
    expect(formatCountdown(at("2026-08-12T12:00:00Z"), NOW)).toBe("1 day")
  })

  it("gives hours and minutes under a day", () => {
    expect(formatCountdown(at("2026-08-11T17:12:00Z"), NOW)).toBe("5 h 12 min")
  })

  it("drops the minutes when they are zero", () => {
    expect(formatCountdown(at("2026-08-11T17:00:00Z"), NOW)).toBe("5 h")
  })

  it("gives minutes alone under an hour", () => {
    expect(formatCountdown(at("2026-08-11T12:12:00Z"), NOW)).toBe("12 min")
  })

  it("stops counting below a minute rather than ticking seconds", () => {
    expect(formatCountdown(at("2026-08-11T12:00:30Z"), NOW)).toBe(
      "less than a minute",
    )
  })

  it("is null once the target has passed", () => {
    expect(formatCountdown(at("2026-08-11T11:59:00Z"), NOW)).toBeNull()
  })

  it("is null exactly on the boundary", () => {
    // The moment it falls due there is nothing left to count down to, and
    // "0 min" beside a heading reads as broken rather than as arrived.
    expect(formatCountdown(NOW, NOW)).toBeNull()
  })
})

describe("nextBoundary", () => {
  it("counts down to the current phase ending", () => {
    const b = nextBoundary(
      { endsAt: at("2026-08-13T12:00:00Z") },
      { startsAt: at("2026-08-13T12:00:00Z") },
      NOW,
    )
    expect(b).toEqual({ verb: "ends", target: at("2026-08-13T12:00:00Z") })
  })

  it("falls through to the next phase starting once the current one has ended", () => {
    // Routine, not an edge case: a declared phase stays current until an
    // organizer moves the pointer, so its end date passing is normal.
    const b = nextBoundary(
      { endsAt: at("2026-08-10T12:00:00Z") },
      { startsAt: at("2026-08-15T09:00:00Z") },
      NOW,
    )
    expect(b).toEqual({ verb: "starts", target: at("2026-08-15T09:00:00Z") })
  })

  it("uses the next phase when there is no current one", () => {
    const b = nextBoundary(null, { startsAt: at("2026-08-15T09:00:00Z") }, NOW)
    expect(b).toEqual({ verb: "starts", target: at("2026-08-15T09:00:00Z") })
  })

  it("is null when the current phase has no end date and nothing is next", () => {
    expect(nextBoundary({ endsAt: undefined }, null, NOW)).toBeNull()
  })

  it("is null when every date is in the past", () => {
    expect(
      nextBoundary(
        { endsAt: at("2026-08-01T12:00:00Z") },
        { startsAt: at("2026-08-02T12:00:00Z") },
        NOW,
      ),
    ).toBeNull()
  })
})
