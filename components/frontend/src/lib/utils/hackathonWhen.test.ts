import { describe, expect, it } from "vitest"
import { relativeWhen, whenGroup } from "./hackathonWhen"

// No trailing Z anywhere here: `daysBetween` counts *local* calendar days,
// so a UTC fixture would fall on a different day depending on the runner's
// timezone and these assertions would hold only in some of them.
const NOW = new Date("2026-09-15T10:00:00")
const d = (s: string) => new Date(s)

describe("whenGroup", () => {
  it("mirrors the three statuses the backend computes", () => {
    expect(whenGroup(1)).toBe("upcoming")
    expect(whenGroup(2)).toBe("now")
    expect(whenGroup(3)).toBe("finished")
  })

  it("has no group for a status it does not know", () => {
    expect(whenGroup(0)).toBeUndefined()
  })
})

describe("relativeWhen", () => {
  it.each([
    ["2026-09-15T23:00:00", "starts today"],
    ["2026-09-16T09:00:00", "starts tomorrow"],
    ["2026-09-19T09:00:00", "starts in 4 days"],
    ["2026-09-29T09:00:00", "starts in 2 weeks"],
  ])("counts down to %s as %s", (starts, expected) => {
    expect(relativeWhen({ status: 1, startsAt: d(starts) }, NOW)).toBe(expected)
  })

  it.each([
    ["2026-09-15T08:00:00", "ended today"],
    ["2026-09-14T08:00:00", "ended yesterday"],
    ["2026-09-12T08:00:00", "ended 3 days ago"],
    ["2026-08-25T08:00:00", "ended 3 weeks ago"],
  ])("counts up from %s as %s", (ends, expected) => {
    expect(relativeWhen({ status: 3, endsAt: d(ends) }, NOW)).toBe(expected)
  })

  it("says how far into a running hackathon we are", () => {
    const h = {
      status: 2,
      startsAt: d("2026-09-15T09:00:00"),
      endsAt: d("2026-09-18T17:00:00"),
    }

    expect(relativeWhen(h, NOW)).toBe("day 1 of 4")
  })

  // Counted by calendar day, so the phrase does not change under you at 00:00
  // partway through an afternoon.
  it("counts the running day inclusively from the start date", () => {
    const h = {
      status: 2,
      startsAt: d("2026-09-13T09:00:00"),
      endsAt: d("2026-09-18T17:00:00"),
    }

    expect(relativeWhen(h, NOW)).toBe("day 3 of 6")
  })

  it("never counts past the last day, whatever the clock says", () => {
    const h = {
      status: 2,
      startsAt: d("2026-09-10T09:00:00"),
      endsAt: d("2026-09-12T17:00:00"),
    }

    expect(relativeWhen(h, NOW)).toBe("day 3 of 3")
  })

  it("falls back to a bare statement with only one date", () => {
    expect(relativeWhen({ status: 2, startsAt: d("2026-09-14") }, NOW)).toBe(
      "happening now",
    )
  })

  // Rendered on the server, these would be counted in the container's timezone
  // rather than the reader's. Callers pass `now` only once the browser can say
  // what it is, and until then the dates stand alone.
  it("says nothing without a clock it can trust", () => {
    const h = { status: 1, startsAt: d("2026-09-19T09:00:00") }

    expect(relativeWhen(h, undefined)).toBeUndefined()
  })

  // A hackathon nobody dated is "Upcoming" for ever, and a countdown to a date
  // that does not exist would be an invention.
  it("says nothing at all when there are no dates", () => {
    expect(relativeWhen({ status: 1 }, NOW)).toBeUndefined()
    expect(relativeWhen({ status: 3 }, NOW)).toBeUndefined()
  })
})
