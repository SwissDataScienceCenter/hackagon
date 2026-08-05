import { describe, it, expect } from "vitest"
import {
  PHASE_CAPABILITIES,
  capabilityLabel,
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
