import { describe, it, expect } from "vitest"
import {
  PHASE_CAPABILITIES,
  capabilityDescription,
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

describe("capabilityDescription", () => {
  // The switches are rendered from PHASE_CAPABILITIES, so a capability with a
  // label and no description would render a row that explains nothing.
  it("describes every capability that has a label", () => {
    for (const c of PHASE_CAPABILITIES) {
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
    ).toBe("Aug 20, 2026 – Aug 25, 2026")
  })

  // Both-or-neither is enforced on write by a CEL rule, but rows predating it can
  // still carry one alone, so neither half may render as "Invalid Date".
  it("handles one bound alone", () => {
    expect(formatPhaseRange(new Date("2026-08-20T09:00"), undefined)).toBe(
      "From Aug 20, 2026",
    )
    expect(formatPhaseRange(undefined, new Date("2026-08-25T18:00"))).toBe(
      "Until Aug 25, 2026",
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
