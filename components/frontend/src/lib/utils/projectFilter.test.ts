import { describe, it, expect } from "vitest"
import {
  DEFAULT_PROJECT_FILTER,
  PROJECT_FILTERS,
  PROJECT_FILTER_LABEL,
  projectFilterFrom,
  projectFilterQuery,
} from "./projectFilter"

describe("projectFilterFrom", () => {
  it.each(PROJECT_FILTERS)("accepts %s", (filter) => {
    expect(projectFilterFrom(filter)).toBe(filter)
  })

  // Parsing only — an unrecognized value is not this function's to resolve, so
  // it says "nothing recognizable" and the caller applies the default. The
  // detail route needs that distinction to know whether it has a tab to carry
  // back.
  it.each([
    ["an absent parameter", null],
    ["an empty parameter", ""],
    ["a word we do not use", "pending"],
    ["a numeric status", "1"],
    ["the all filter an earlier pass had", "all"],
  ])("returns undefined for %s", (_name, raw) => {
    expect(projectFilterFrom(raw)).toBeUndefined()
  })
})

describe("DEFAULT_PROJECT_FILTER", () => {
  // Fixed, not derived from the counts. A default that moved with the data made
  // a hackathon's whole line-up look gone the moment one proposal arrived, and
  // meant the same URL could show two people different things.
  it("is the approved line-up", () => {
    expect(DEFAULT_PROJECT_FILTER).toBe("approved")
  })

  it("is one of the filters", () => {
    expect(PROJECT_FILTERS).toContain(DEFAULT_PROJECT_FILTER)
  })
})

describe("projectFilterQuery", () => {
  // Explicit for all three, approved included, so every tab's address has the
  // same shape and a decision can carry an organiser back to the exact tab.
  it.each(PROJECT_FILTERS)("names %s explicitly", (filter) => {
    const query = projectFilterQuery(filter)

    expect(query).toBe(`?status=${filter}`)
    expect(projectFilterFrom(new URLSearchParams(query).get("status"))).toBe(
      filter,
    )
  })
})

describe("PROJECT_FILTER_LABEL", () => {
  it("labels every filter", () => {
    for (const filter of PROJECT_FILTERS) {
      expect(PROJECT_FILTER_LABEL[filter]).toBeTruthy()
    }
  })

  // Names the work rather than the status, which is why it is not "Proposed".
  it("calls the pending slice Awaiting review", () => {
    expect(PROJECT_FILTER_LABEL.proposed).toBe("Awaiting review")
  })

  // Approved leads, so the tab an organiser lands on is the first one.
  it("shows approved first", () => {
    expect(PROJECT_FILTERS[0]).toBe("approved")
  })
})
