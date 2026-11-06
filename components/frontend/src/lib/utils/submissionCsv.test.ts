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
  standing: "Submitted",
  updatedAt: new Date("2026-08-01T10:05:42Z"),
  updatedBy: "Bob",
  attachmentFolderUrl: "https://drive.example.org/byte-me",
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
      "Last Updated (UTC)",
      "Last Updated By",
      "Attachments",
      "Result",
    ])
    expect(parsed[1]).toEqual([
      "Byte Me",
      "Flood maps",
      "Alice, Bob",
      "Submitted",
      "2026-08-01 10:05",
      "Bob",
      "https://drive.example.org/byte-me",
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
          updatedAt: undefined,
          updatedBy: undefined,
          attachmentFolderUrl: undefined,
          repositoryUrl: undefined,
        }),
      ]),
    )

    expect(parsed[1]?.slice(3)).toEqual(["No submission", "", "", "", ""])
  })

  it("survives notes holding commas, quotes and line breaks", () => {
    const result = 'Repo is "private", ask us\nDemo on Friday'
    const parsed = parseCsv(submissionCsv([row({ repositoryUrl: result })]))

    expect(parsed).toHaveLength(2)
    expect(parsed[1]?.[7]).toBe(result)
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
