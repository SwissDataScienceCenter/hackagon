import { describe, expect, it } from "vitest"
import { localIsoDate } from "./localDate"

describe("localIsoDate", () => {
  it("pads month and day", () => {
    expect(localIsoDate(new Date(2026, 2, 4))).toBe("2026-03-04")
  })

  // Local midnight is the previous day in UTC east of Greenwich, which is what
  // toISOString() would have printed.
  it("reads the local calendar, not UTC", () => {
    expect(localIsoDate(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01")
  })

  it("is a dash when there is no date", () => {
    expect(localIsoDate(undefined)).toBe("—")
  })
})
