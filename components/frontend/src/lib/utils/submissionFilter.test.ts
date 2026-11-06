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
    ["a standing we no longer use", "draft"],
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
    expect(inSubmissionFilter("submitted", "all")).toBe(true)
  })

  it("puts a standing on its own tab and no other", () => {
    expect(inSubmissionFilter("submitted", "submitted")).toBe(true)
    expect(inSubmissionFilter("submitted", "missing")).toBe(false)
    expect(inSubmissionFilter("missing", "submitted")).toBe(false)
  })
})

describe("submissionFilterCounts", () => {
  it("counts each tab, with All holding everyone", () => {
    expect(
      submissionFilterCounts(["missing", "submitted", "submitted"]),
    ).toEqual({ all: 3, missing: 1, submitted: 2 })
  })

  it("is zero everywhere with no teams", () => {
    expect(submissionFilterCounts([])).toEqual({
      all: 0,
      missing: 0,
      submitted: 0,
    })
  })
})
