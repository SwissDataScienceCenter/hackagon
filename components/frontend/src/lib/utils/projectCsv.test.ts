import { describe, it, expect } from "vitest"
import { parseCsv } from "./csv"
import {
  markdownToSheetText,
  projectCsv,
  type ProjectCsvRow,
} from "./projectCsv"

const row = (over: Partial<ProjectCsvRow> = {}): ProjectCsvRow => ({
  title: "Vision Pipeline",
  creator: "Alice Doe",
  status: "Approved",
  description: "A camera that sorts compost.",
  ...over,
})

describe("projectCsv", () => {
  it("writes a header and one row per project, description last", () => {
    const parsed = parseCsv(projectCsv([row()]))

    expect(parsed[0]).toEqual([
      "Project",
      "Proposed By",
      "Status",
      "Description",
    ])
    expect(parsed[1]).toEqual([
      "Vision Pipeline",
      "Alice Doe",
      "Approved",
      "A camera that sorts compost.",
    ])
  })

  it("is a header on its own when there is nothing to export", () => {
    expect(parseCsv(projectCsv([]))).toHaveLength(1)
  })

  it("survives a description holding commas, quotes and line breaks", () => {
    const description = 'Sort "wet", then dry\nWeigh it'
    const parsed = parseCsv(projectCsv([row({ description })]))

    expect(parsed).toHaveLength(2)
    expect(parsed[1]?.[3]).toBe(description)
  })

  it("takes the markdown markers off the description", () => {
    const parsed = parseCsv(
      projectCsv([
        row({ description: "## The idea\n\nTrack **solar** output" }),
      ]),
    )

    expect(parsed[1]?.[3]).toBe("The idea\n\nTrack solar output")
  })

  it("leaves the proposer blank when nobody could be named", () => {
    const parsed = parseCsv(projectCsv([row({ creator: "" })]))

    expect(parsed[1]?.[1]).toBe("")
  })
})

describe("markdownToSheetText", () => {
  it("strips heading markers and keeps the words", () => {
    expect(markdownToSheetText("### The idea")).toBe("The idea")
  })

  it("strips bold, italic, strikethrough and code markers", () => {
    expect(markdownToSheetText("**Very** _fast_, ~~cheap~~ and `typed`")).toBe(
      "Very fast, cheap and typed",
    )
  })

  it("keeps line breaks and paragraph breaks", () => {
    expect(markdownToSheetText("One\nTwo\n\nThree")).toBe("One\nTwo\n\nThree")
  })

  it("collapses a run of blank lines to one paragraph break", () => {
    expect(markdownToSheetText("One\n\n\n\nTwo")).toBe("One\n\nTwo")
  })

  it("keeps list markers, normalising every bullet to a dash", () => {
    expect(markdownToSheetText("- one\n* two\n+ three\n1. four")).toBe(
      "- one\n- two\n- three\n1. four",
    )
  })

  it("keeps a nested bullet's indentation", () => {
    expect(markdownToSheetText("- one\n  * nested")).toBe("- one\n  - nested")
  })

  it("writes a link as its text followed by the url", () => {
    expect(markdownToSheetText("See [the docs](https://x.y/a).")).toBe(
      "See the docs (https://x.y/a).",
    )
  })

  it("writes a bare link as just the url, not twice", () => {
    expect(markdownToSheetText("[https://x.y](https://x.y)")).toBe(
      "https://x.y",
    )
  })

  it("drops a link title, which is never shown", () => {
    expect(markdownToSheetText('[docs](https://x.y "The docs")')).toBe(
      "docs (https://x.y)",
    )
  })

  it("keeps an image's alt text and its url", () => {
    expect(markdownToSheetText("![A schematic](https://x.y/s.png)")).toBe(
      "A schematic (https://x.y/s.png)",
    )
  })

  it("leaves underscores in a url alone", () => {
    expect(markdownToSheetText("See https://x.y/a_b_c now")).toBe(
      "See https://x.y/a_b_c now",
    )
  })

  it("unwraps an autolink", () => {
    expect(markdownToSheetText("<https://x.y/a_b>")).toBe("https://x.y/a_b")
  })

  it("keeps an escaped marker as the character it escapes", () => {
    expect(markdownToSheetText("A 5\\*5 grid, \\*not italic\\*")).toBe(
      "A 5*5 grid, *not italic*",
    )
  })

  it("leaves the inside of a code span untouched", () => {
    expect(markdownToSheetText("Run `make **all**` now")).toBe(
      "Run make **all** now",
    )
  })

  it("keeps a fenced block verbatim and drops the fences", () => {
    expect(markdownToSheetText("Try:\n\n```sh\nmake -j2 *\n```\n")).toBe(
      "Try:\n\nmake -j2 *",
    )
  })

  it("drops a blockquote marker", () => {
    expect(markdownToSheetText("> A quote")).toBe("A quote")
  })

  it("turns a horizontal rule into a paragraph break", () => {
    expect(markdownToSheetText("One\n\n---\n\nTwo")).toBe("One\n\nTwo")
  })

  it("keeps a setext heading's words and drops its underline", () => {
    expect(markdownToSheetText("The idea\n========\n\nBody")).toBe(
      "The idea\n\nBody",
    )
  })

  it("trims trailing whitespace and the blank lines around the whole text", () => {
    expect(markdownToSheetText("\n\n  Body   \n\n")).toBe("Body")
  })

  it("is empty for an empty description", () => {
    expect(markdownToSheetText("")).toBe("")
  })
})
