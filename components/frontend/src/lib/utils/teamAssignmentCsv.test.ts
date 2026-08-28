import { describe, it, expect } from "vitest"
import {
  applyAssignmentCsv,
  assignmentCsv,
  type AssignmentRow,
  type ImportWorld,
} from "./teamAssignmentCsv"
import type { PlannedTeam } from "./teamDistribution"

const QUESTIONS = [
  { key: "experience", label: "How much have you hacked before?" },
  { key: "tshirt", label: "T-shirt size" },
]

const row = (over: Partial<AssignmentRow> = {}): AssignmentRow => ({
  userId: "u1",
  name: "Alice Doe",
  project: "Vision Pipeline",
  team: "Team VP",
  prefers: ["Vision Pipeline"],
  answers: { experience: "Many", tshirt: "M" },
  ...over,
})

const team = (over: Partial<PlannedTeam> = {}): PlannedTeam => ({
  key: "t1",
  id: "t1",
  projectId: "p1",
  name: "Team VP",
  memberIds: [],
  ...over,
})

const world = (over: Partial<ImportWorld> = {}): ImportWorld => ({
  people: [
    { id: "u1", name: "Alice Doe" },
    { id: "u2", name: "Bob Smith" },
  ],
  projects: [
    { id: "p1", title: "Vision Pipeline" },
    { id: "p2", title: "Chat Agent" },
  ],
  teams: [team({ memberIds: ["u1"] })],
  ...over,
})

describe("assignmentCsv", () => {
  it("heads the fixed columns, then one per question", () => {
    const [header] = assignmentCsv([], QUESTIONS).split("\r\n")

    expect(header).toBe(
      "user_id,name,project,team,prefers,How much have you hacked before?,T-shirt size",
    )
  })

  it("writes a person's row, preferences joined and answers in column order", () => {
    const [, first] = assignmentCsv(
      [row({ prefers: ["Vision Pipeline", "Chat Agent"] })],
      QUESTIONS,
    ).split("\r\n")

    // Unquoted: a semicolon is an ordinary character in a comma-separated
    // file, and the header is what a reader sniffs the delimiter from.
    expect(first).toBe(
      "u1,Alice Doe,Vision Pipeline,Team VP,Vision Pipeline; Chat Agent,Many,M",
    )
  })

  it("leaves an unanswered question's cell empty", () => {
    const [, first] = assignmentCsv([row({ answers: {} })], QUESTIONS).split(
      "\r\n",
    )

    expect(first?.endsWith(",,")).toBe(true)
  })

  it("writes an unassigned person with no project and no team", () => {
    const [, first] = assignmentCsv([row({ project: "", team: "" })], []).split(
      "\r\n",
    )

    expect(first).toBe("u1,Alice Doe,,,Vision Pipeline")
  })
})

describe("applyAssignmentCsv", () => {
  const file = (...lines: string[]) =>
    ["user_id,name,project,team", ...lines].join("\r\n") + "\r\n"

  it("is a no-op on a file that says what the workspace already says", () => {
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,Vision Pipeline,Team VP"),
      world(),
      { max: 6 },
    )

    expect(result.moved).toBe(0)
    expect(result.problems).toEqual([])
    expect(result.teams).toEqual(world().teams)
  })

  it("moves somebody onto a team that already exists", () => {
    const result = applyAssignmentCsv(
      file("u2,Bob Smith,Vision Pipeline,Team VP"),
      world(),
      { max: 6 },
    )

    expect(result.teams[0]?.memberIds).toEqual(["u1", "u2"])
    expect(result.moved).toBe(1)
    expect(result.read).toBe(1)
  })

  it("unassigns on a blank team, whatever the project says", () => {
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,Vision Pipeline,"),
      world(),
      { max: 6 },
    )

    expect(result.teams[0]?.memberIds).toEqual([])
    expect(result.moved).toBe(1)
  })

  it("creates a team the file names but the workspace does not hold", () => {
    const result = applyAssignmentCsv(
      file("u2,Bob Smith,Chat Agent,Team CA"),
      world(),
      { max: 6 },
    )

    expect(result.created).toEqual(["Team CA"])
    expect(result.teams[1]).toEqual({
      key: "csv-0",
      id: null,
      projectId: "p2",
      name: "Team CA",
      memberIds: ["u2"],
    })
  })

  it("hands out a key no second import can collide with", () => {
    const once = applyAssignmentCsv(
      file("u2,Bob Smith,Chat Agent,Team CA"),
      world(),
      { max: 6 },
    )
    const twice = applyAssignmentCsv(
      file("u1,Alice Doe,Chat Agent,Team CA 2"),
      world({ teams: once.teams }),
      { max: 6 },
    )

    expect(twice.teams.map((t) => t.key)).toEqual(["t1", "csv-0", "csv-1"])
  })

  it("matches a project and a team however they are cased", () => {
    const result = applyAssignmentCsv(
      file("u2,Bob Smith,vision pipeline,TEAM VP"),
      world(),
      { max: 6 },
    )

    expect(result.created).toEqual([])
    expect(result.teams[0]?.memberIds).toEqual(["u1", "u2"])
  })

  it("leaves anybody the file does not mention exactly as they are", () => {
    const result = applyAssignmentCsv(
      file("u2,Bob Smith,Chat Agent,Team CA"),
      world(),
      { max: 6 },
    )

    expect(result.teams[0]?.memberIds).toEqual(["u1"])
    expect(result.absent).toBe(1)
  })

  it("never deletes a team, even one the file empties", () => {
    const result = applyAssignmentCsv(file("u1,Alice Doe,,"), world(), {
      max: 6,
    })

    expect(result.teams).toHaveLength(1)
    expect(result.teams[0]?.memberIds).toEqual([])
  })

  it("reads the columns by name, not by position", () => {
    const result = applyAssignmentCsv(
      "team,notes,USER_ID,project\r\nTeam VP,anything,u2,Vision Pipeline\r\n",
      world(),
      { max: 6 },
    )

    expect(result.problems).toEqual([])
    expect(result.teams[0]?.memberIds).toEqual(["u1", "u2"])
  })

  it("says which teams are now too big without refusing them", () => {
    const crowd = Array.from({ length: 7 }, (_, i) => ({
      id: `x${i}`,
      name: `Person ${i}`,
    }))
    const result = applyAssignmentCsv(
      ["user_id,name,project,team"]
        .concat(crowd.map((p) => `${p.id},${p.name},Vision Pipeline,Team VP`))
        .join("\r\n"),
      world({ people: crowd, teams: [team()] }),
      { max: 6 },
    )

    expect(result.oversized).toEqual(["Team VP"])
    expect(result.teams[0]?.memberIds).toHaveLength(7)
  })

  describe("what it refuses", () => {
    it("an empty file", () => {
      const result = applyAssignmentCsv("", world(), { max: 6 })

      expect(result.problems).toEqual(["That file is empty."])
      expect(result.teams).toEqual(world().teams)
    })

    it("a file with none of the columns it reads", () => {
      const result = applyAssignmentCsv(
        "name,email\r\nAlice,a@example.com\r\n",
        world(),
        { max: 6 },
      )

      expect(result.problems[0]).toContain("needs a user_id")
      expect(result.read).toBe(0)
    })

    it("a row for somebody this page cannot place, naming them", () => {
      const result = applyAssignmentCsv(
        file("u9,Carol Jones,Vision Pipeline,Team VP"),
        world(),
        { max: 6 },
      )

      expect(result.problems).toEqual([
        "Row 2: Carol Jones is not somebody this page can place.",
      ])
      expect(result.moved).toBe(0)
    })

    it("a team on a project that is not on this page", () => {
      const result = applyAssignmentCsv(
        file("u2,Bob Smith,Weather Bot,Team WB"),
        world(),
        { max: 6 },
      )

      expect(result.problems).toEqual([
        'Row 2: no project on this page is called "Weather Bot".',
      ])
      expect(result.created).toEqual([])
    })

    it("a team with no project to put it on", () => {
      const result = applyAssignmentCsv(
        file("u2,Bob Smith,,Team CA"),
        world(),
        { max: 6 },
      )

      expect(result.problems).toEqual([
        'Row 2: Bob Smith is on "Team CA", but no project says which.',
      ])
    })

    it("a second row for the same person, keeping the first", () => {
      const result = applyAssignmentCsv(
        file(
          "u2,Bob Smith,Vision Pipeline,Team VP",
          "u2,Bob Smith,Chat Agent,Team CA",
        ),
        world(),
        { max: 6 },
      )

      expect(result.problems).toEqual([
        "Row 3: Bob Smith appears more than once; the first won.",
      ])
      expect(result.teams[0]?.memberIds).toEqual(["u1", "u2"])
      expect(result.created).toEqual([])
    })

    it("a truncated row, rather than reading it as an unassignment", () => {
      const result = applyAssignmentCsv(
        "user_id,name,project,team\r\nu1,Alice Doe\r\n",
        world(),
        { max: 6 },
      )

      expect(result.problems).toEqual(["Row 2: too few columns to read."])
      expect(result.teams[0]?.memberIds).toEqual(["u1"])
    })

    it("one bad row without losing the good ones around it", () => {
      const result = applyAssignmentCsv(
        file(
          "u9,Carol Jones,Vision Pipeline,Team VP",
          "u2,Bob Smith,Vision Pipeline,Team VP",
        ),
        world(),
        { max: 6 },
      )

      expect(result.problems).toHaveLength(1)
      expect(result.read).toBe(1)
      expect(result.teams[0]?.memberIds).toEqual(["u1", "u2"])
    })
  })
})
