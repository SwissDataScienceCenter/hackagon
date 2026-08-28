import { describe, it, expect } from "vitest"
import { csvField, csvFilename, csvRow, parseCsv } from "./csv"

describe("csvField", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvField("Alice Doe")).toBe("Alice Doe")
  })

  it("quotes a comma, a quote or a newline", () => {
    expect(csvField("Doe, Alice")).toBe('"Doe, Alice"')
    expect(csvField('5" pipe')).toBe('"5"" pipe"')
    expect(csvField("two\nlines")).toBe('"two\nlines"')
  })

  it("leaves a value that only spreadsheets fear alone", () => {
    // No defusing apostrophe: it would corrupt the actual value.
    expect(csvField("=SUM(A1)")).toBe("=SUM(A1)")
  })
})

describe("csvRow", () => {
  it("joins with commas and terminates", () => {
    expect(csvRow(["a", "b"])).toBe("a,b\r\n")
  })
})

describe("csvFilename", () => {
  it("slugifies the hackathon's name", () => {
    expect(csvFilename("AI Hack 2026", "participants")).toBe(
      "ai-hack-2026-participants.csv",
    )
  })

  it("falls back when nothing survives slugifying", () => {
    expect(csvFilename("!!!", "teams")).toBe("hackathon-teams.csv")
  })
})

describe("parseCsv", () => {
  it("reads plain rows", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  it("reads what csvRow wrote, whatever is in it", () => {
    const written =
      csvRow(["user_id", "name"]) + csvRow(["u1", 'Doe, "Alice"\nsecond line'])

    expect(parseCsv(written)).toEqual([
      ["user_id", "name"],
      ["u1", 'Doe, "Alice"\nsecond line'],
    ])
  })

  it("takes \\n, \\r\\n and no trailing break", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
    expect(parseCsv("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  it("drops the BOM a spreadsheet writes", () => {
    expect(parseCsv("﻿user_id,name\r\nu1,Alice\r\n")[0]).toEqual([
      "user_id",
      "name",
    ])
  })

  it("sniffs a semicolon file, as a European locale re-saves one", () => {
    expect(parseCsv("user_id;name;team\r\nu1;Alice;Team VP\r\n")).toEqual([
      ["user_id", "name", "team"],
      ["u1", "Alice", "Team VP"],
    ])
  })

  it("sniffs tabs", () => {
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  it("keeps the comma when a line holds no other candidate", () => {
    expect(parseCsv("name\r\nAlice")).toEqual([["name"], ["Alice"]])
  })

  it("drops blank lines but keeps a row of empty cells apart from them", () => {
    expect(parseCsv("a,b\r\n\r\n1,\r\n")).toEqual([
      ["a", "b"],
      ["1", ""],
    ])
  })

  it("keeps a short row for the caller to judge", () => {
    expect(parseCsv("a,b,c\r\n1\r\n")).toEqual([["a", "b", "c"], ["1"]])
  })

  it("treats a quote inside a started field as an ordinary character", () => {
    expect(parseCsv('a,5" pipe\r\n')).toEqual([["a", '5" pipe']])
  })

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual([])
    expect(parseCsv("\r\n\r\n")).toEqual([])
  })
})
