import { describe, it, expect } from "vitest"
import { nextStep, type MyProgress } from "./nextSteps"

// Capability numeric values.
const REGISTER = 1
const PROPOSE_PROJECTS = 2
const SET_TEAM_PREFERENCES = 3
const CREATE_PROJECT_SUBMISSIONS = 4
const VOTE = 5
const VIEW_RESULTS = 6
const VIEW_TEAMS = 7

const nothingYet: MyProgress = {
  proposedCount: 0,
  preferredCount: 0,
  team: null,
}
const onTeam = (submissionCount: number): MyProgress => ({
  ...nothingYet,
  team: { id: "t1", name: "Team Rocket", submissionCount },
})

describe("nextStep", () => {
  // Anyone reading the overview has already joined.
  it("has no row for Register", () => {
    expect(nextStep("h1", REGISTER, nothingYet)).toBeUndefined()
  })

  describe("propose projects", () => {
    it("offers proposing when the viewer has proposed nothing", () => {
      const step = nextStep("h1", PROPOSE_PROJECTS, nothingYet)
      expect(step).toMatchObject({
        label: "Propose a project",
        done: false,
        href: "/my/hackathon/h1/projects/propose",
      })
    })

    it("points at their own projects once they have proposed", () => {
      const step = nextStep("h1", PROPOSE_PROJECTS, {
        ...nothingYet,
        proposedCount: 2,
      })
      expect(step).toMatchObject({
        label: "You proposed 2 projects",
        done: true,
        href: "/my/hackathon/h1/projects/mine",
      })
    })

    it("counts one project in the singular", () => {
      const step = nextStep("h1", PROPOSE_PROJECTS, {
        ...nothingYet,
        proposedCount: 1,
      })
      expect(step?.label).toBe("You proposed 1 project")
    })
  })

  describe("preferred projects", () => {
    it("asks for picks when there are none", () => {
      expect(nextStep("h1", SET_TEAM_PREFERENCES, nothingYet)).toMatchObject({
        done: false,
        href: "/my/hackathon/h1/projects",
      })
    })

    it("counts the picks once there are some", () => {
      const step = nextStep("h1", SET_TEAM_PREFERENCES, {
        ...nothingYet,
        preferredCount: 3,
      })
      expect(step).toMatchObject({ label: "You picked 3 projects", done: true })
    })
  })

  describe("team assignments", () => {
    it("sends someone on no team to the team list", () => {
      expect(nextStep("h1", VIEW_TEAMS, nothingYet)).toMatchObject({
        label: "Teams are out",
        done: false,
        href: "/my/hackathon/h1/teams",
      })
    })

    it("names the viewer's team and links to it", () => {
      expect(nextStep("h1", VIEW_TEAMS, onTeam(0))).toMatchObject({
        label: "You're on Team Rocket",
        done: true,
        href: "/my/hackathon/h1/teams/t1",
      })
    })
  })

  describe("submissions", () => {
    // Nothing to submit against, so nowhere to send them.
    it("links nowhere without a team", () => {
      const step = nextStep("h1", CREATE_PROJECT_SUBMISSIONS, nothingYet)
      expect(step?.description).toBe("You need a team to submit.")
      expect(step?.href).toBeUndefined()
      expect(step?.done).toBe(false)
    })

    it("asks for work from a team that has handed in none", () => {
      expect(
        nextStep("h1", CREATE_PROJECT_SUBMISSIONS, onTeam(0)),
      ).toMatchObject({
        description: "Nothing submitted yet.",
        done: false,
        href: "/my/hackathon/h1/submissions/mine",
      })
    })

    it("reads as done once the team has submitted", () => {
      expect(
        nextStep("h1", CREATE_PROJECT_SUBMISSIONS, onTeam(1)),
      ).toMatchObject({
        label: "Your team has submitted",
        done: true,
        href: "/my/hackathon/h1/submissions/mine",
      })
    })
  })

  it.each([
    [VOTE, "/my/hackathon/h1/voting"],
    [VIEW_RESULTS, "/my/hackathon/h1/results"],
  ])("gives capability %i a single open step", (capability, href) => {
    expect(nextStep("h1", capability, nothingYet)).toMatchObject({
      done: false,
      href,
    })
  })

  it("has no row for an unknown capability", () => {
    expect(nextStep("h1", 99, nothingYet)).toBeUndefined()
  })
})
