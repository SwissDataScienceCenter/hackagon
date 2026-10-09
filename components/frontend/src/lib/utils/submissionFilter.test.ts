import { describe, it, expect } from "vitest"
import {
  SUBMISSION_FILTERS,
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
