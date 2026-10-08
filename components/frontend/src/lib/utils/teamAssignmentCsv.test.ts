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
  const opts = { max: 6 }

  // Bob as the download writes him while he has no team.
  const BOB_FREE = "u2,Bob Smith,,"

  it("changes nothing when the file is the download, unedited", () => {
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,Vision Pipeline,Team VP", BOB_FREE),
      world(),
      opts,
    )

    expect(result.refused).toBe(false)
    expect(result.problems).toEqual([])
    expect(result.moved).toBe(0)
    expect(result.teams).toEqual(world().teams)
  })

  it("moves somebody onto a team that already exists, keeping its id", () => {
    const result = applyAssignmentCsv(
      file(
        "u1,Alice Doe,Vision Pipeline,Team VP",
        "u2,Bob Smith,Vision Pipeline,Team VP",
      ),
      world(),
      opts,
    )

    expect(result.teams).toEqual([team({ memberIds: ["u1", "u2"] })])
    expect(result.moved).toBe(1)
    expect(result.read).toBe(2)
  })

  it("creates a team the file names but the workspace does not hold", () => {
    const result = applyAssignmentCsv(
      file(
        "u1,Alice Doe,Vision Pipeline,Team VP",
        "u2,Bob Smith,Chat Agent,Team CA",
      ),
      world(),
      opts,
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
      file(
        "u1,Alice Doe,Vision Pipeline,Team VP",
        "u2,Bob Smith,Chat Agent,Team CA",
      ),
      world(),
      opts,
    )
    const twice = applyAssignmentCsv(
      file(
        "u1,Alice Doe,Chat Agent,Team CA 2",
        "u2,Bob Smith,Chat Agent,Team CA",
      ),
      world({ teams: once.teams }),
      opts,
    )

    expect(twice.teams.map((t) => t.key)).toEqual(["csv-0", "csv-1"])
  })

  it("matches a project and a team however they are cased", () => {
    const result = applyAssignmentCsv(
      file(
        "u1,Alice Doe,Vision Pipeline,Team VP",
        "u2,Bob Smith,vision pipeline,TEAM VP",
      ),
      world(),
      opts,
    )

    expect(result.created).toEqual([])
    expect(result.teams[0]?.memberIds).toEqual(["u1", "u2"])
  })

  it("unassigns a row with neither project nor team", () => {
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,,", BOB_FREE),
      world(),
      opts,
    )

    expect(result.problems).toEqual([])
    expect(result.unassigned).toBe(1)
    expect(result.teams).toEqual([])
  })

  it("removes a team the file leaves with nobody, and says which", () => {
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,Chat Agent,Team CA", BOB_FREE),
      world(),
      opts,
    )

    expect(result.teams.map((t) => t.name)).toEqual(["Team CA"])
    expect(result.removed).toEqual(["Team VP"])
    expect(result.unassigned).toBe(0)
    expect(result.moved).toBe(1)
  })

  it("reads the columns by name, not by position", () => {
    const result = applyAssignmentCsv(
      "team,notes,USER_ID,project\r\n" +
        "Team VP,anything,u1,Vision Pipeline\r\n" +
        "Team VP,,u2,Vision Pipeline\r\n",
      world(),
      opts,
    )

    expect(result.problems).toEqual([])
    expect(result.teams[0]?.memberIds).toEqual(["u1", "u2"])
  })

  it("warns about, but applies around, somebody unassigned with no row", () => {
    // Bob joined after the download: nobody could have written his row.
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,Chat Agent,Team CA"),
      world(),
      opts,
    )

    expect(result.refused).toBe(false)
    expect(result.problems).toEqual([])
    expect(result.warnings).toEqual([
      "1 unassigned person has no row in the file, perhaps because they " +
        "joined after it was downloaded: Bob Smith. They stay unassigned.",
    ])
    expect(result.teams.map((t) => [t.name, t.memberIds])).toEqual([
      ["Team CA", ["u1"]],
    ])
  })

  it("has nothing to warn about when everyone has a row", () => {
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,Vision Pipeline,Team VP", BOB_FREE),
      world(),
      opts,
    )

    expect(result.warnings).toEqual([])
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
      opts,
    )

    expect(result.oversized).toEqual(["Team VP"])
    expect(result.teams[0]?.memberIds).toHaveLength(7)
  })

  describe("refuses the whole file, changing nothing, over", () => {
    const refused = (text: string) => {
      const result = applyAssignmentCsv(text, world(), opts)

      expect(result.refused).toBe(true)
      expect(result.teams).toEqual(world().teams)
      expect(result.created).toEqual([])

      return result.problems
    }

    it("an empty file", () => {
      expect(refused("")).toEqual(["That file is empty."])
    })

    it("a file with none of the columns it reads", () => {
      expect(refused("name,email\r\nAlice,a@example.com\r\n")[0]).toContain(
        "needs a user_id",
      )
    })

    it("somebody on a team missing from the file, naming them", () => {
      expect(refused(file(BOB_FREE))).toEqual([
        "1 person who is on a team has no row in the file: Alice Doe. Every " +
          "participant needs a row; leave project and team empty to unassign " +
          "someone.",
      ])
    })

    it("many people on a team missing, in one line", () => {
      const crowd = Array.from({ length: 5 }, (_, i) => ({
        id: `x${i}`,
        name: `Person ${i}`,
      }))
      const result = applyAssignmentCsv(
        file("x0,Person 0,Vision Pipeline,Team VP"),
        world({
          people: crowd,
          teams: [team({ memberIds: crowd.map((p) => p.id) })],
        }),
        opts,
      )

      expect(result.refused).toBe(true)
      expect(result.problems).toEqual([
        "4 people who are on a team have no row in the file: Person 1, " +
          "Person 2, Person 3 and 1 more. Every participant needs a row; " +
          "leave project and team empty to unassign someone.",
      ])
    })

    it("a project with no team, rather than guessing it means unassign", () => {
      expect(refused(file("u1,Alice Doe,Vision Pipeline,", BOB_FREE))).toEqual([
        "Row 2: Alice Doe has a project but no team; an assignment needs both.",
      ])
    })

    it("a team with no project to put it on", () => {
      expect(
        refused(
          file("u1,Alice Doe,Vision Pipeline,Team VP", "u2,Bob Smith,,Team CA"),
        ),
      ).toEqual([
        'Row 3: Bob Smith is on "Team CA", but no project says which.',
      ])
    })

    it("a team on a project that is not on this page", () => {
      expect(
        refused(
          file(
            "u1,Alice Doe,Vision Pipeline,Team VP",
            "u2,Bob Smith,Weather Bot,Team WB",
          ),
        ),
      ).toEqual(['Row 3: no project on this page is called "Weather Bot".'])
    })

    it("a row for somebody this page cannot place, naming them", () => {
      expect(
        refused(
          file(
            "u1,Alice Doe,Vision Pipeline,Team VP",
            BOB_FREE,
            "u9,Carol Jones,Vision Pipeline,Team VP",
          ),
        ),
      ).toEqual(["Row 4: Carol Jones is not somebody this page can place."])
    })

    it("a second row for the same person", () => {
      expect(
        refused(
          file(
            "u1,Alice Doe,Vision Pipeline,Team VP",
            BOB_FREE,
            "u2,Bob Smith,Chat Agent,Team CA",
          ),
        ),
      ).toEqual(["Row 4: Bob Smith appears more than once."])
    })

    it("a truncated row, rather than reading it as an unassignment", () => {
      expect(refused(file("u1,Alice Doe", BOB_FREE))).toEqual([
        "Row 2: too few columns to read.",
        "1 person who is on a team has no row in the file: Alice Doe. Every " +
          "participant needs a row; leave project and team empty to unassign " +
          "someone.",
      ])
    })
  })
})
