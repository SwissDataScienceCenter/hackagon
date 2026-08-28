import { describe, it, expect } from "vitest"
import { capabilityHref } from "./capabilityLinks"
import { ALL_CAPABILITIES } from "$lib/utils/phase"

// Capability numeric values.
const REGISTER = 1
const PROPOSE_PROJECTS = 2
const SET_TEAM_PREFERENCES = 3
const CREATE_PROJECT_SUBMISSIONS = 4
const VOTE = 5
const VIEW_RESULTS = 6
const VIEW_TEAMS = 7

describe("capabilityHref", () => {
  it.each([
    [PROPOSE_PROJECTS, "/my/hackathon/h1/projects/propose"],
    [SET_TEAM_PREFERENCES, "/my/hackathon/h1/projects"],
    [CREATE_PROJECT_SUBMISSIONS, "/my/hackathon/h1/submissions"],
    [VOTE, "/my/hackathon/h1/voting"],
    [VIEW_RESULTS, "/my/hackathon/h1/results"],
    [VIEW_TEAMS, "/my/hackathon/h1/teams"],
  ])("sends capability %i to its own route", (capability, href) => {
    expect(capabilityHref("h1", capability)).toBe(href)
  })

  // Joining happens on the dashboard, and anyone reading the card is already in.
  // Still listed as open or closed — there is just nowhere to send them.
  it("has no destination for Register", () => {
    expect(capabilityHref("h1", REGISTER)).toBeUndefined()
  })

  it("has no destination for a value outside the enum", () => {
    expect(capabilityHref("h1", 99)).toBeUndefined()
  })

  // A capability added to the enum without a route here would render as a plain
  // chip rather than crash — but silently, so this states the current coverage.
  it("covers every capability but Register", () => {
    const linked = ALL_CAPABILITIES.filter(
      (c) => capabilityHref("h1", c.value) !== undefined,
    ).map((c) => c.value)
    expect(linked).toEqual([
      PROPOSE_PROJECTS,
      SET_TEAM_PREFERENCES,
      VIEW_TEAMS,
      CREATE_PROJECT_SUBMISSIONS,
      VOTE,
      VIEW_RESULTS,
    ])
  })
})
