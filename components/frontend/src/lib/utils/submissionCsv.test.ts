import { describe, it, expect } from "vitest"
import { parseCsv } from "./csv"
import {
  sheetTime,
  submissionCsv,
  type SubmissionCsvRow,
} from "./submissionCsv"

const row = (over: Partial<SubmissionCsvRow> = {}): SubmissionCsvRow => ({
  team: "Byte Me",
  project: "Flood maps",
  members: ["Alice", "Bob"],
  standing: "Final",
  version: 3,
  submittedAt: new Date("2026-08-01T10:05:42Z"),
  submittedBy: "Bob",
  finalizedAt: new Date("2026-08-02T09:00:00Z"),
  finalizedBy: "Alice",
  newerDraft: undefined,
  repositoryUrl: "https://github.com/byte-me/floods",
  ...over,
})

describe("submissionCsv", () => {
  it("writes a header and one row per team, result last", () => {
    const parsed = parseCsv(submissionCsv([row()]))

    expect(parsed[0]).toEqual([
      "Team",
      "Project",
      "Members",
      "Standing",
      "Version",
      "Submitted (UTC)",
      "Submitted By",
      "Finalized (UTC)",
      "Finalized By",
      "Newer Draft",
      "Result",
    ])
    expect(parsed[1]).toEqual([
      "Byte Me",
      "Flood maps",
      "Alice, Bob",
      "Final",
      "3",
      "2026-08-01 10:05",
      "Bob",
      "2026-08-02 09:00",
      "Alice",
      "",
      "https://github.com/byte-me/floods",
    ])
  })

  it("is a header on its own when there are no teams", () => {
    expect(parseCsv(submissionCsv([]))).toHaveLength(1)
  })

  it("leaves every submission column blank for a team with nothing filed", () => {
    const parsed = parseCsv(
      submissionCsv([
        row({
          standing: "No submission",
          version: undefined,
          submittedAt: undefined,
          submittedBy: undefined,
          finalizedAt: undefined,
          finalizedBy: undefined,
          repositoryUrl: undefined,
        }),
      ]),
    )

    expect(parsed[1]?.slice(3)).toEqual([
      "No submission",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ])
  })

  it("names a newer draft by its version", () => {
    const parsed = parseCsv(submissionCsv([row({ newerDraft: 4 })]))

    expect(parsed[1]?.[9]).toBe("4")
  })

  it("survives notes holding commas, quotes and line breaks", () => {
    const result = 'Repo is "private", ask us\nDemo on Friday'
    const parsed = parseCsv(submissionCsv([row({ repositoryUrl: result })]))

    expect(parsed).toHaveLength(2)
    expect(parsed[1]?.[10]).toBe(result)
  })
})

describe("sheetTime", () => {
  it("is blank without a time", () => {
    expect(sheetTime(undefined)).toBe("")
  })

  it("drops seconds and writes UTC whatever the local zone", () => {
    expect(sheetTime(new Date("2026-12-31T23:59:59.999Z"))).toBe(
      "2026-12-31 23:59",
    )
  })
})
