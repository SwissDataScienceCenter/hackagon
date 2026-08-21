import { describe, it, expect } from "vitest"
import {
  initialsOf,
  suggestDistribution,
  type DistributablePerson,
  type DistributableProject,
  type PlannedTeam,
} from "./teamDistribution"

const SIZES = { max: 6 }

/** n people, all preferring the same list of projects. */
function people(
  n: number,
  prefs: string[],
  prefix = "u",
): DistributablePerson[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${String(i).padStart(3, "0")}`,
    preferredProjectIds: prefs,
  }))
}

function project(
  id: string,
  title: string,
  teams: DistributableProject["teams"] = [],
) {
  return { id, title, teams }
}

const placed = (plan: PlannedTeam[]) => plan.flatMap((t) => t.memberIds)
const forProject = (plan: PlannedTeam[], id: string) =>
  plan.filter((t) => t.projectId === id)
const sizesOf = (plan: PlannedTeam[]) => plan.map((t) => t.memberIds.length)

describe("suggestDistribution", () => {
  it("puts everyone on a project they actually asked for", () => {
    const projects = [project("a", "Alpha"), project("b", "Beta")]
    const pool = [...people(5, ["a"], "x"), ...people(5, ["b"], "y")]

    const plan = suggestDistribution(projects, pool, SIZES)
    const projectOf = new Map(
      plan.flatMap((t) => t.memberIds.map((m) => [m, t.projectId] as const)),
    )

    for (const person of pool) {
      expect(person.preferredProjectIds).toContain(projectOf.get(person.id))
    }
  })

  it("never seats more than the maximum on one team", () => {
    const plan = suggestDistribution(
      [project("a", "Alpha")],
      people(20, ["a"]),
      SIZES,
    )

    expect(plan.length).toBeGreaterThan(1)
    for (const team of plan)
      expect(team.memberIds.length).toBeLessThanOrEqual(SIZES.max)
  })

  it("stays at or under the maximum for every total", () => {
    for (let n = 1; n <= 60; n++) {
      const sizes = sizesOf(
        suggestDistribution([project("a", "Alpha")], people(n, ["a"]), SIZES),
      )

      expect({ n, over: sizes.filter((s) => s > SIZES.max) }).toEqual({
        n,
        over: [],
      })
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n)
    }
  })

  it("balances a remainder instead of leaving a team of one", () => {
    // 7 people, max 6: two teams of 4 and 3, not 6 and 1.
    expect(
      sizesOf(
        suggestDistribution([project("a", "Alpha")], people(7, ["a"]), SIZES),
      ),
    ).toEqual([4, 3])
  })

  it("gives a project its team however few people want it", () => {
    // The whole reason there is no minimum. Two people who want a project get a
    // team of two; whether that is viable is the organizer's call, not a rule's.
    const projects = [project("big", "Big"), project("tiny", "Tiny")]
    const pool = [...people(6, ["big"], "b"), ...people(2, ["tiny"], "t")]

    const plan = suggestDistribution(projects, pool, SIZES)

    expect(sizesOf(forProject(plan, "tiny"))).toEqual([2])
    expect(placed(plan)).toHaveLength(8)
  })

  it("leaves nobody unassigned who picked something on offer", () => {
    const projects = ["a", "b", "c"].map((id) => project(id, id.toUpperCase()))
    const pool = [
      ...people(9, ["a"], "x"),
      ...people(2, ["b"], "y"),
      ...people(1, ["c"], "z"),
    ]

    expect(placed(suggestDistribution(projects, pool, SIZES))).toHaveLength(12)
  })

  it("leaves someone with no preferences unassigned", () => {
    const pool = [
      ...people(4, ["a"], "p"),
      { id: "z", preferredProjectIds: [] },
    ]

    const plan = suggestDistribution([project("a", "Alpha")], pool, SIZES)

    expect(placed(plan)).not.toContain("z")
    expect(placed(plan)).toHaveLength(4)
  })

  it("ignores a preference for a project that is not on offer", () => {
    const pool = people(3, ["a", "gone"])

    const plan = suggestDistribution([project("a", "Alpha")], pool, SIZES)

    expect(forProject(plan, "gone")).toHaveLength(0)
    expect(placed(plan)).toHaveLength(3)
  })

  it("keeps an existing team and the people already on it", () => {
    const projects = [
      project("a", "Alpha", [{ id: "t1", name: "Team A", memberIds: ["old"] }]),
    ]

    const plan = suggestDistribution(projects, people(2, ["a"]), SIZES)

    expect(plan).toHaveLength(1)
    expect(plan[0]?.id).toBe("t1")
    expect(plan[0]?.memberIds).toContain("old")
    expect(plan[0]?.memberIds).toHaveLength(3)
  })

  it("opens a second team and balances it against the existing one", () => {
    // 1 already there + 9 assigned = 10, which is two teams of 5. Filling the
    // existing team to the maximum first would give 6 and 4 instead.
    const projects = [
      project("a", "Alpha Project", [
        { id: "t1", name: "Team AP", memberIds: ["old"] },
      ]),
    ]

    const [existing, opened] = suggestDistribution(
      projects,
      people(9, ["a"]),
      SIZES,
    )

    expect(existing?.id).toBe("t1")
    expect(existing?.memberIds).toContain("old")
    expect(existing?.memberIds).toHaveLength(5)
    expect(opened?.id).toBeNull()
    expect(opened?.name).toBe("Team AP 2")
    expect(opened?.memberIds).toHaveLength(5)
  })

  it("never empties a team that already exists", () => {
    // Three teams, only four takers. Every team keeps somebody rather than one
    // being hollowed out — deleting a team is the organizer's call.
    const projects = [
      project("a", "Alpha", [
        { id: "t1", name: "One", memberIds: [] },
        { id: "t2", name: "Two", memberIds: [] },
        { id: "t3", name: "Three", memberIds: [] },
      ]),
    ]

    const plan = suggestDistribution(projects, people(4, ["a"]), SIZES)

    expect(plan).toHaveLength(3)
    expect(sizesOf(plan)).toEqual([2, 1, 1])
    expect(plan.every((t) => t.id !== null)).toBe(true)
  })

  it("leaves a project alone when nobody new is joining it", () => {
    const projects = [
      project("a", "Alpha", [
        { id: "t1", name: "Team A", memberIds: ["x", "y", "z"] },
      ]),
      project("b", "Beta"),
    ]

    const plan = suggestDistribution(projects, people(4, ["b"]), SIZES)

    expect(forProject(plan, "a")).toHaveLength(1)
    expect(forProject(plan, "a")[0]?.memberIds).toEqual(["x", "y", "z"])
  })

  it("never places one person twice", () => {
    const projects = ["a", "b", "c"].map((id) => project(id, id.toUpperCase()))
    const all = placed(
      suggestDistribution(projects, people(30, ["a", "b", "c"]), SIZES),
    )

    expect(new Set(all).size).toBe(all.length)
  })

  it("is deterministic", () => {
    const projects = ["a", "b", "c"].map((id) => project(id, id.toUpperCase()))
    const pool = people(40, ["a", "b", "c"])

    expect(suggestDistribution(projects, pool, SIZES)).toEqual(
      suggestDistribution(projects, pool, SIZES),
    )
  })

  it("spreads across preferences rather than piling onto one project", () => {
    const projects = [project("a", "Alpha"), project("b", "Beta")]

    const plan = suggestDistribution(projects, people(12, ["a", "b"]), SIZES)

    expect(forProject(plan, "a").length).toBeGreaterThan(0)
    expect(forProject(plan, "b").length).toBeGreaterThan(0)
  })

  it("handles a hackathon the size of the Data for Good fixture", () => {
    // 15 projects, 104 participants, weighted the way cmd/seed weights them.
    const weights = [12, 6, 4, 3, 1, 11, 7, 5, 3, 1, 10, 8, 5, 2, 1]
    const projects = weights.map((_, i) => project(`p${i}`, `Project ${i}`))

    let seed = 1
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648

      return seed % n
    }
    const total = weights.reduce((a, b) => a + b, 0)
    const pool: DistributablePerson[] = Array.from({ length: 104 }, (_, i) => {
      const picks = new Set<string>()
      const wanted = 1 + next(4)
      while (picks.size < wanted) {
        let r = next(total)
        picks.add(`p${weights.findIndex((w) => (r -= w) < 0)}`)
      }

      return {
        id: `u${String(i).padStart(3, "0")}`,
        preferredProjectIds: [...picks],
      }
    })

    const plan = suggestDistribution(projects, pool, SIZES)
    const all = placed(plan)

    // Everybody placed exactly once, on something they asked for, in a team no
    // bigger than the maximum.
    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(pool.length)

    const prefs = new Map(pool.map((p) => [p.id, p.preferredProjectIds]))
    for (const team of plan) {
      expect(team.memberIds.length).toBeGreaterThan(0)
      expect(team.memberIds.length).toBeLessThanOrEqual(SIZES.max)
      for (const m of team.memberIds)
        expect(prefs.get(m)).toContain(team.projectId)
    }

    // Without a minimum, every project somebody picked gets to run. (The
    // weighted draw can leave a project with no takers at all; that one does
    // not, and should not.)
    const wanted = new Set(pool.flatMap((p) => p.preferredProjectIds))

    expect(new Set(plan.map((t) => t.projectId))).toEqual(wanted)
  })
})

describe("initialsOf", () => {
  it("takes the initial of each word", () => {
    expect(initialsOf("AutoML Pipeline Builder")).toBe("APB")
  })

  it("falls back rather than returning nothing", () => {
    expect(initialsOf("   ")).toBe("?")
  })
})
