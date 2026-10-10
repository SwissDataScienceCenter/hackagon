import { describe, it, expect } from "vitest"
import {
  SUBMISSION_FILTERS,
  inSubmissionFilter,
  submissionFilterCounts,
  submissionFilterFrom,
  submissionFilterQuery,
} from "./submissionFilter"

describe("submissionFilterFrom", () => {
  it.each(SUBMISSION_FILTERS)("accepts %s", (filter) => {
    expect(submissionFilterFrom(filter)).toBe(filter)
  })

  it.each([
    ["an absent parameter", null],
    ["an empty parameter", ""],
    ["a word we do not use", "pending"],
    ["a numeric status", "2"],
  ])("returns undefined for %s", (_name, raw) => {
    expect(submissionFilterFrom(raw)).toBeUndefined()
  })
})

describe("submissionFilterQuery", () => {
  it.each(SUBMISSION_FILTERS)("round-trips %s", (filter) => {
    const raw = new URLSearchParams(submissionFilterQuery(filter)).get(
      "standing",
    )

    expect(submissionFilterFrom(raw)).toBe(filter)
  })
})

describe("inSubmissionFilter", () => {
  it("puts every standing on All", () => {
    expect(inSubmissionFilter("missing", "all")).toBe(true)
    expect(inSubmissionFilter("final", "all")).toBe(true)
  })

  it("puts a standing on its own tab and no other", () => {
    expect(inSubmissionFilter("draft", "draft")).toBe(true)
    expect(inSubmissionFilter("draft", "final")).toBe(false)
    expect(inSubmissionFilter("draft", "missing")).toBe(false)
  })
})

describe("submissionFilterCounts", () => {
  it("counts each tab, with All holding everyone", () => {
    expect(
      submissionFilterCounts(["missing", "draft", "draft", "final"]),
    ).toEqual({ all: 4, missing: 1, draft: 2, final: 1 })
  })

  it("is zero everywhere with no teams", () => {
    expect(submissionFilterCounts([])).toEqual({
      all: 0,
      missing: 0,
      draft: 0,
      final: 0,
    })
  })
})
