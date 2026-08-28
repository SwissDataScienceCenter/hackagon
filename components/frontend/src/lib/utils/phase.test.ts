import { describe, it, expect } from "vitest"
import {
  ALL_CAPABILITIES,
  capabilityDescription,
  capabilityLabel,
  currentAndNextPhase,
  formatPhaseRange,
  resolvePhaseStatus,
  toDateTimeLocal,
} from "./phase"

const past = new Date(Date.now() - 86_400_000)
const older = new Date(Date.now() - 172_800_000)
const future = new Date(Date.now() + 86_400_000)
const later = new Date(Date.now() + 172_800_000)

describe("resolvePhaseStatus", () => {
  describe("with no declared current phase", () => {
    it("derives from dates, as before current phases existed", () => {
      expect(
        resolvePhaseStatus(
          { id: "a", startsAt: older, endsAt: past },
          undefined,
        ),
      ).toBe("completed")
      expect(
        resolvePhaseStatus(
          { id: "a", startsAt: past, endsAt: future },
          undefined,
        ),
      ).toBe("active")
      expect(
        resolvePhaseStatus(
          { id: "a", startsAt: future, endsAt: later },
          undefined,
        ),
      ).toBe("upcoming")
    })

    it("treats an empty declaration the same as none", () => {
      expect(
        resolvePhaseStatus({ id: "a", startsAt: past, endsAt: future }, ""),
      ).toBe("active")
    })
  })

  describe("with a declared current phase", () => {
    it("marks the declared phase current", () => {
      expect(
        resolvePhaseStatus({ id: "a", startsAt: future, endsAt: later }, "a"),
      ).toBe("current")
    })

    // The Internal Product Sprint fixture: every phase is past, yet Demo is
    // declared current. The organizer's answer wins over the dates.
    it("marks it current even when its dates have passed", () => {
      expect(
        resolvePhaseStatus({ id: "a", startsAt: older, endsAt: past }, "a"),
      ).toBe("current")
    })

    it("still calls an ended phase completed", () => {
      expect(
        resolvePhaseStatus({ id: "b", startsAt: older, endsAt: past }, "a"),
      ).toBe("completed")
    })

    // The surprising branch, and the reason the rule is written down: a phase
    // whose dates are running reads as upcoming when the organizer has declared a
    // different one current. One timeline, one answer to "where are we".
    it("never lets another phase claim nowness", () => {
      expect(
        resolvePhaseStatus({ id: "b", startsAt: past, endsAt: future }, "a"),
      ).toBe("upcoming")
    })

    it("calls an undated phase upcoming", () => {
      expect(resolvePhaseStatus({ id: "b" }, "a")).toBe("upcoming")
    })
  })
})

describe("capabilityLabel", () => {
  it("labels each of the seven capabilities", () => {
    expect(capabilityLabel(1)).toBe("Register")
    expect(capabilityLabel(6)).toBe("View results")
    expect(capabilityLabel(7)).toBe("See team assignments")
  })

  // Typed `string | undefined` on purpose, so callers are made to supply a
  // fallback — the timeline renders "Unknown".
  it("returns undefined for an unknown value", () => {
    expect(capabilityLabel(0)).toBeUndefined()
    expect(capabilityLabel(99)).toBeUndefined()
  })
})

describe("ALL_CAPABILITIES", () => {
  // The order a hackathon runs, which is not enum order: VIEW_TEAMS is numbered
  // 7 and sits fourth, between the preferences teams are formed from and the
  // submissions they are filed against. Pinned because the switch panel and the
  // participant-facing lists both read this sequence, and a reorder that touched
  // only one of them would have them disagree on screen.
  it("lists the seven in the order a hackathon runs", () => {
    expect(ALL_CAPABILITIES.map((c) => c.value)).toEqual([1, 2, 3, 7, 4, 5, 6])
    expect(ALL_CAPABILITIES.every((c) => c.label.length > 0)).toBe(true)
  })
})

describe("capabilityDescription", () => {
  // One table holds both fields, so the pairing is structural — what is left to
  // check is that nobody left a sentence empty beside a switch.
  it("describes every capability the switches render", () => {
    for (const c of ALL_CAPABILITIES) {
      expect(capabilityDescription(c.value)).toBeTruthy()
    }
  })

  it("returns undefined for an unknown value", () => {
    expect(capabilityDescription(99)).toBeUndefined()
  })
})

describe("toDateTimeLocal", () => {
  it("formats a date the way datetime-local wants it", () => {
    // Constructed from local parts, so the output must read them back
    // unchanged whatever timezone the test runs in.
    expect(toDateTimeLocal(new Date(2026, 8, 1, 9, 5))).toBe("2026-09-01T09:05")
  })

  it("zero-pads month, day, hour and minute", () => {
    expect(toDateTimeLocal(new Date(2026, 0, 2, 3, 4))).toBe("2026-01-02T03:04")
  })

  it("is empty for no date, so the input renders blank", () => {
    expect(toDateTimeLocal(undefined)).toBe("")
  })
})

describe("formatPhaseRange", () => {
  it("names both bounds when both are set", () => {
    expect(
      formatPhaseRange(
        new Date("2026-08-20T09:00"),
        new Date("2026-08-25T18:00"),
      ),
    ).toBe("Aug 20, 2026, 09:00 – Aug 25, 2026, 18:00")
  })

  // The case the date-only format could not tell apart: three phases of one
  // hackathon day all read "Aug 25, 2026 – Aug 25, 2026" before.
  it("collapses the repeated date on a single-day range", () => {
    expect(
      formatPhaseRange(
        new Date("2026-08-25T09:00"),
        new Date("2026-08-25T13:00"),
      ),
    ).toBe("Aug 25, 2026, 09:00 – 13:00")
  })

  // Midnight on both bounds is an organizer who left the time fields alone, so
  // the range is the whole day and there is no time worth printing.
  it("prints dates alone when both bounds are at midnight", () => {
    expect(
      formatPhaseRange(
        new Date("2026-08-20T00:00"),
        new Date("2026-08-25T00:00"),
      ),
    ).toBe("Aug 20, 2026 – Aug 25, 2026")
  })

  it("collapses an all-day range to the one date", () => {
    expect(
      formatPhaseRange(
        new Date("2026-08-25T00:00"),
        new Date("2026-08-25T00:00"),
      ),
    ).toBe("Aug 25, 2026")
  })

  // One decision for the range, not per bound: an end at 00:00 keeps its time
  // rather than looking like a range with no end stated.
  it("shows both times when only one bound has one", () => {
    expect(
      formatPhaseRange(
        new Date("2026-08-25T09:00"),
        new Date("2026-08-26T00:00"),
      ),
    ).toBe("Aug 25, 2026, 09:00 – Aug 26, 2026, 00:00")
  })

  // Both-or-neither is enforced on write by a CEL rule, but rows predating it can
  // still carry one alone, so neither half may render as "Invalid Date".
  it("handles one bound alone", () => {
    expect(formatPhaseRange(new Date("2026-08-20T09:00"), undefined)).toBe(
      "From Aug 20, 2026, 09:00",
    )
    expect(formatPhaseRange(undefined, new Date("2026-08-25T18:00"))).toBe(
      "Until Aug 25, 2026, 18:00",
    )
    expect(formatPhaseRange(new Date("2026-08-20T00:00"), undefined)).toBe(
      "From Aug 20, 2026",
    )
  })

  it("says so when a phase has no dates at all", () => {
    expect(formatPhaseRange(undefined, undefined)).toBe("No dates set")
  })
})

describe("currentAndNextPhase", () => {
  const a = { id: "a", startsAt: older, endsAt: past }
  const b = { id: "b", startsAt: past, endsAt: future }
  const c = { id: "c", startsAt: future, endsAt: later }

  it("falls back to the dates when nothing is declared", () => {
    const { current, next, declared } = currentAndNextPhase(
      [c, a, b],
      undefined,
    )
    expect(current?.id).toBe("b")
    expect(next?.id).toBe("c")
    expect(declared).toBe(false)
  })

  // The declaration wins over the clock, same precedence resolvePhaseStatus
  // applies — so a phase whose dates have not started can still be current.
  it("prefers a declaration over the running phase", () => {
    const { current, next, declared } = currentAndNextPhase([a, b, c], "c")
    expect(current?.id).toBe("c")
    expect(next).toBeUndefined()
    expect(declared).toBe(true)
  })

  // Answering with a different phase would be worse than answering with none:
  // the pointer says the organizer has decided, whatever the dates say.
  it("does not fall back to the dates when the declared phase is missing", () => {
    const { current, declared } = currentAndNextPhase([a, b], "gone")
    expect(current).toBeUndefined()
    expect(declared).toBe(true)
  })

  it("offers the first unfinished phase as next when nothing is running", () => {
    const { current, next } = currentAndNextPhase([a, c], undefined)
    expect(current).toBeUndefined()
    expect(next?.id).toBe("c")
  })

  it("has neither for a hackathon with no phases", () => {
    expect(currentAndNextPhase([], undefined)).toEqual({
      current: undefined,
      next: undefined,
      declared: false,
    })
  })
})
