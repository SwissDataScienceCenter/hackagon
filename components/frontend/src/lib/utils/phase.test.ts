import { describe, it, expect } from "vitest"
import {
  PHASE_CAPABILITIES,
  capabilityLabel,
  currentAndNextPhase,
  extraEnabledCapabilities,
  formatPhaseRange,
  resolvePhaseStatus,
  toDateTimeLocal,
  unmetPhaseCapabilities,
  withPhaseCapabilitiesEnabled,
} from "./phase"

// Capability numeric values.
const PROPOSE = 2
const SUBMISSIONS = 4
const VOTE = 5
const VIEW_RESULTS = 6

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

describe("unmetPhaseCapabilities", () => {
  it("reports tags that are not switched on", () => {
    expect(unmetPhaseCapabilities([VOTE, VIEW_RESULTS], [VOTE])).toEqual([
      VIEW_RESULTS,
    ])
  })

  it("is empty when everything the phase expects is on", () => {
    expect(
      unmetPhaseCapabilities([SUBMISSIONS], [SUBMISSIONS, PROPOSE]),
    ).toEqual([])
  })

  it("is empty for an untagged phase", () => {
    expect(unmetPhaseCapabilities([], [PROPOSE])).toEqual([])
  })

  it("keeps the phase's own tag order", () => {
    expect(unmetPhaseCapabilities([VIEW_RESULTS, PROPOSE], [])).toEqual([
      VIEW_RESULTS,
      PROPOSE,
    ])
  })

  // An unknown tag cannot be switched on, so calling it missing would be noise.
  it("drops unknown tag values", () => {
    expect(unmetPhaseCapabilities([99, VOTE], [])).toEqual([VOTE])
  })
})

describe("extraEnabledCapabilities", () => {
  const REGISTER = 1

  // The Climate Tech fixture while Judging is current: registration is planned
  // for no phase, so it shows as "also enabled" rather than as a problem.
  it("reports what is on but not planned for the phase", () => {
    expect(extraEnabledCapabilities([VOTE], [REGISTER, PROPOSE, VOTE])).toEqual(
      [REGISTER, PROPOSE],
    )
  })

  it("is empty when everything on was planned", () => {
    expect(extraEnabledCapabilities([VOTE, PROPOSE], [VOTE])).toEqual([])
  })

  it("is empty when nothing is enabled", () => {
    expect(extraEnabledCapabilities([VOTE], [])).toEqual([])
  })

  it("lists everything enabled for an untagged phase", () => {
    expect(extraEnabledCapabilities([], [PROPOSE, VOTE])).toEqual([
      PROPOSE,
      VOTE,
    ])
  })

  it("sorts, so the order does not follow however the state arrived", () => {
    expect(extraEnabledCapabilities([], [VOTE, REGISTER, PROPOSE])).toEqual([
      REGISTER,
      PROPOSE,
      VOTE,
    ])
  })

  it("drops unknown values", () => {
    expect(extraEnabledCapabilities([], [99, VOTE])).toEqual([VOTE])
  })
})

describe("withPhaseCapabilitiesEnabled", () => {
  const REGISTER = 1

  it("switches on what the phase expects", () => {
    expect(withPhaseCapabilitiesEnabled([], [VOTE, VIEW_RESULTS])).toEqual([
      VOTE,
      VIEW_RESULTS,
    ])
  })

  // The property the whole design rests on. Registration is tagged on no phase,
  // so an exact match would close sign-ups just because Hacking does not
  // mention them.
  it("never switches anything off", () => {
    expect(
      withPhaseCapabilitiesEnabled([REGISTER, PROPOSE], [SUBMISSIONS]),
    ).toEqual([REGISTER, PROPOSE, SUBMISSIONS])
  })

  it("is a no-op when the phase asks for nothing new", () => {
    expect(withPhaseCapabilitiesEnabled([PROPOSE], [PROPOSE])).toEqual([
      PROPOSE,
    ])
  })

  it("is a no-op for an untagged phase", () => {
    expect(withPhaseCapabilitiesEnabled([PROPOSE], [])).toEqual([PROPOSE])
  })

  // SetCapabilities refuses anything outside the enum, so one bad tag would fail
  // the whole call rather than being ignored.
  it("drops unknown tag values", () => {
    expect(withPhaseCapabilitiesEnabled([], [99, VOTE])).toEqual([VOTE])
  })

  it("deduplicates", () => {
    expect(withPhaseCapabilitiesEnabled([VOTE], [VOTE, VOTE])).toEqual([VOTE])
  })
})

describe("capabilityLabel", () => {
  it("labels each of the six capabilities", () => {
    expect(capabilityLabel(1)).toBe("Register")
    expect(capabilityLabel(6)).toBe("View results")
  })

  // Typed `string | undefined` on purpose, so callers are made to supply a
  // fallback — the timeline renders "Unknown".
  it("returns undefined for an unknown value", () => {
    expect(capabilityLabel(0)).toBeUndefined()
    expect(capabilityLabel(99)).toBeUndefined()
  })
})

describe("PHASE_CAPABILITIES", () => {
  it("lists the six in enum order, each with a label", () => {
    expect(PHASE_CAPABILITIES.map((c) => c.value)).toEqual([1, 2, 3, 4, 5, 6])
    expect(PHASE_CAPABILITIES.every((c) => c.label.length > 0)).toBe(true)
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
  it("reads out both ends when a phase is fully dated", () => {
    expect(formatPhaseRange(new Date(2026, 2, 1), new Date(2026, 2, 3))).toBe(
      "Mar 1, 2026 – Mar 3, 2026",
    )
  })

  // All four combinations, because both dates are optional in the schema and a
  // row can carry either alone.
  it("names the open end when only one date is set", () => {
    expect(formatPhaseRange(undefined, new Date(2026, 2, 3))).toBe(
      "Until Mar 3, 2026",
    )
    expect(formatPhaseRange(new Date(2026, 2, 1), undefined)).toBe(
      "From Mar 1, 2026",
    )
  })

  it("says so rather than rendering an empty line for an undated phase", () => {
    expect(formatPhaseRange(undefined, undefined)).toBe("No dates set")
  })
})

describe("currentAndNextPhase", () => {
  // Ids deliberately out of date order, so a result that matched only because
  // the input arrived sorted would not.
  const p = (id: string, startsAt: Date, endsAt: Date) => ({
    id,
    startsAt,
    endsAt,
  })
  const done = p("done", older, past)
  const live = p("live", past, future)
  const soon = p("soon", future, later)
  const all = [soon, done, live]

  describe("with nothing declared", () => {
    it("falls back to the phase whose own dates are running", () => {
      const { current, next, declared } = currentAndNextPhase(all, undefined)

      expect(current?.id).toBe("live")
      expect(next?.id).toBe("soon")
      expect(declared).toBe(false)
    })

    it("offers the first phase not yet over when none is running", () => {
      const { current, next } = currentAndNextPhase([done, soon], undefined)

      expect(current).toBeUndefined()
      expect(next?.id).toBe("soon")
    })

    it("has no next once every phase has ended", () => {
      const { current, next } = currentAndNextPhase([done], undefined)

      expect(current).toBeUndefined()
      expect(next).toBeUndefined()
    })
  })

  describe("with a phase declared current", () => {
    // The declaration wins over the dates — same precedence resolvePhaseStatus
    // applies, so the hub and the timeline cannot name different phases as live.
    it("takes the declared phase even while another one's dates are running", () => {
      const { current, next, declared } = currentAndNextPhase(all, "done")

      expect(current?.id).toBe("done")
      expect(next?.id).toBe("live")
      expect(declared).toBe(true)
    })

    it("has no next after the last phase in date order", () => {
      expect(currentAndNextPhase(all, "soon").next).toBeUndefined()
    })

    // Answering with a different phase would be worse than answering with none:
    // the pointer says the organizer has decided.
    it("resolves to no current phase when the pointer names one that is gone", () => {
      const { current, declared } = currentAndNextPhase(all, "deleted")

      expect(current).toBeUndefined()
      expect(declared).toBe(true)
    })
  })
})
