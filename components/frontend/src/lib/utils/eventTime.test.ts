import { describe, expect, it } from "vitest"
import {
  fromEventDateTime,
  readEventDateTime,
  toEventDateTime,
} from "./eventTime"

describe("fromEventDateTime", () => {
  it("reads a winter time as Zurich time, UTC+1", () => {
    expect(fromEventDateTime("2026-11-13T18:00")?.toISOString()).toBe(
      "2026-11-13T17:00:00.000Z",
    )
  })

  it("reads a summer time as Zurich time, UTC+2", () => {
    expect(fromEventDateTime("2026-07-01T09:00")?.toISOString()).toBe(
      "2026-07-01T07:00:00.000Z",
    )
  })

  it("reads midnight as the start of that day in Zurich", () => {
    expect(fromEventDateTime("2026-11-14T00:00")?.toISOString()).toBe(
      "2026-11-13T23:00:00.000Z",
    )
  })

  it("moves a time skipped by the spring change an hour later", () => {
    // 02:30 on 2026-03-29 does not exist in Zurich: clocks jump 02:00 -> 03:00.
    expect(fromEventDateTime("2026-03-29T02:30")?.toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    )
  })

  it("takes the offset in force on either side of the autumn change", () => {
    expect(fromEventDateTime("2026-10-25T01:30")?.toISOString()).toBe(
      "2026-10-24T23:30:00.000Z",
    )
    expect(fromEventDateTime("2026-10-25T03:30")?.toISOString()).toBe(
      "2026-10-25T02:30:00.000Z",
    )
  })

  it("refuses what is not a date and time", () => {
    expect(fromEventDateTime("2026-11-13")).toBeNull()
    expect(fromEventDateTime("2026-02-30T10:00")).toBeNull()
    expect(fromEventDateTime("2026-11-13T24:00")).toBeNull()
    expect(fromEventDateTime("tomorrow")).toBeNull()
  })
})

describe("toEventDateTime", () => {
  it("shows an instant on Zurich's clock", () => {
    expect(toEventDateTime(new Date("2026-11-13T17:00:00Z"))).toBe(
      "2026-11-13T18:00",
    )
    expect(toEventDateTime(new Date("2026-07-01T07:00:00Z"))).toBe(
      "2026-07-01T09:00",
    )
  })

  it("shows midnight as 00:00, not 24:00", () => {
    expect(toEventDateTime(new Date("2026-11-13T23:00:00Z"))).toBe(
      "2026-11-14T00:00",
    )
  })

  it("is empty for no date", () => {
    expect(toEventDateTime(undefined)).toBe("")
  })

  it("round-trips through fromEventDateTime", () => {
    for (const v of [
      "2026-01-05T08:15",
      "2026-06-21T23:59",
      "2026-12-31T00:00",
    ]) {
      expect(toEventDateTime(fromEventDateTime(v) ?? undefined)).toBe(v)
    }
  })
})

describe("readEventDateTime", () => {
  it("is undefined for an empty or missing field", () => {
    expect(readEventDateTime(null)).toBeUndefined()
    expect(readEventDateTime("  ")).toBeUndefined()
  })

  it("is null for a value that is not a date and time", () => {
    expect(readEventDateTime("2026-11-13")).toBeNull()
  })

  it("parses a filled field in Zurich time", () => {
    expect(readEventDateTime("2026-11-13T09:00")?.toISOString()).toBe(
      "2026-11-13T08:00:00.000Z",
    )
  })
})
