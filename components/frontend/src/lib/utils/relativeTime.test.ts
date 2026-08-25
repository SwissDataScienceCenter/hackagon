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
      false,
    )
    expect(b).toEqual({ verb: "ends", target: at("2026-08-13T12:00:00Z") })
  })

  it("counts down to the end of a declared phase too", () => {
    // A declared phase's own end date is still worth naming — it is what the
    // organizer scheduled. Only the *next* phase's start is a promise the dates
    // cannot keep.
    const b = nextBoundary(
      { endsAt: at("2026-08-13T12:00:00Z") },
      { startsAt: at("2026-08-14T09:00:00Z") },
      NOW,
      true,
    )
    expect(b).toEqual({ verb: "ends", target: at("2026-08-13T12:00:00Z") })
  })

  it("falls through to the next phase starting once the current one has ended", () => {
    const b = nextBoundary(
      { endsAt: at("2026-08-10T12:00:00Z") },
      { startsAt: at("2026-08-15T09:00:00Z") },
      NOW,
      false,
    )
    expect(b).toEqual({ verb: "starts", target: at("2026-08-15T09:00:00Z") })
  })

  it("names no start while a phase is declared current", () => {
    // The lie this guard exists to stop: nothing starts the next phase but
    // SetCurrentPhase, so "starts in 3 days" would be false, not just stale.
    expect(
      nextBoundary(
        { endsAt: at("2026-08-10T12:00:00Z") },
        { startsAt: at("2026-08-15T09:00:00Z") },
        NOW,
        true,
      ),
    ).toBeNull()
  })

  it("names no start for a declaration that resolves to no phase", () => {
    // A `current_phase_id` naming a phase that is not in the list. The pointer
    // still says an organizer is driving, so the dates still decide nothing.
    expect(
      nextBoundary(null, { startsAt: at("2026-08-15T09:00:00Z") }, NOW, true),
    ).toBeNull()
  })

  it("uses the next phase when there is no current one", () => {
    const b = nextBoundary(
      null,
      { startsAt: at("2026-08-15T09:00:00Z") },
      NOW,
      false,
    )
    expect(b).toEqual({ verb: "starts", target: at("2026-08-15T09:00:00Z") })
  })

  it("is null when the current phase has no end date and nothing is next", () => {
    expect(nextBoundary({ endsAt: undefined }, null, NOW, false)).toBeNull()
  })

  it("is null when every date is in the past", () => {
    expect(
      nextBoundary(
        { endsAt: at("2026-08-01T12:00:00Z") },
        { startsAt: at("2026-08-02T12:00:00Z") },
        NOW,
        false,
      ),
    ).toBeNull()
  })
})
