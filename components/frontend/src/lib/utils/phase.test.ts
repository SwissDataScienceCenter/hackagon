import { describe, it, expect } from "vitest"
import { PHASE_CAPABILITIES, capabilityLabel, toDateTimeLocal } from "./phase"

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
