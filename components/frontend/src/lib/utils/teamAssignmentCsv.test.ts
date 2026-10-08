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

  const shape = (teams: PlannedTeam[]) =>
    teams.map((t) => [t.projectId, t.name, t.memberIds])

  it("rebuilds the download, unedited, without a warning", () => {
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,Vision Pipeline,Team VP", BOB_FREE),
      world(),
      opts,
    )

    expect(result.refused).toBe(false)
    expect(result.warnings).toEqual([])
    expect(shape(result.teams)).toEqual([["p1", "Team VP", ["u1"]]])
    expect(result.assigned).toBe(1)
    expect(result.unassigned).toBe(1)
  })

  it("replaces every team with a new one, even under the same name", () => {
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,Vision Pipeline,Team VP", BOB_FREE),
      world(),
      opts,
    )

    expect(result.teams).toEqual([
      {
        key: "csv-0",
        id: null,
        projectId: "p1",
        name: "Team VP",
        memberIds: ["u1"],
      },
    ])
  })

  it("puts people with the same project and team together, however cased", () => {
    const result = applyAssignmentCsv(
      file(
        "u1,Alice Doe,Vision Pipeline,Team VP",
        "u2,Bob Smith,vision pipeline,TEAM VP",
      ),
      world(),
      opts,
    )

    expect(shape(result.teams)).toEqual([["p1", "Team VP", ["u1", "u2"]]])
  })

  it("keeps one name on two projects as two teams", () => {
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,Vision Pipeline,Blue", "u2,Bob Smith,Chat Agent,Blue"),
      world(),
      opts,
    )

    expect(shape(result.teams)).toEqual([
      ["p1", "Blue", ["u1"]],
      ["p2", "Blue", ["u2"]],
    ])
  })

  it("leaves nobody on a team the file does not name", () => {
    const result = applyAssignmentCsv(
      file("u1,Alice Doe,,", BOB_FREE),
      world(),
      opts,
    )

    expect(result.teams).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.unassigned).toBe(2)
  })

  it("reads the columns by name, not by position", () => {
    const result = applyAssignmentCsv(
      "team,notes,USER_ID,project\r\n" +
        "Team VP,anything,u1,Vision Pipeline\r\n" +
        "Team VP,,u2,Vision Pipeline\r\n",
      world(),
      opts,
    )

    expect(result.warnings).toEqual([])
    expect(shape(result.teams)).toEqual([["p1", "Team VP", ["u1", "u2"]]])
  })

  it("says which teams are too big without refusing them", () => {
    const crowd = Array.from({ length: 7 }, (_, i) => ({
      id: `x${i}`,
      name: `Person ${i}`,
    }))
    const result = applyAssignmentCsv(
      ["user_id,name,project,team"]
        .concat(crowd.map((p) => `${p.id},${p.name},Vision Pipeline,Team VP`))
        .join("\r\n"),
      world({ people: crowd, teams: [] }),
      opts,
    )

    expect(result.oversized).toEqual(["Team VP"])
  })

  describe("warns, and leaves the person unassigned, over", () => {
    // Alice is on Team VP before every upload here, so "unassigned" is a
    // change, not a coincidence.
    const warned = (...lines: string[]) => {
      const result = applyAssignmentCsv(file(...lines), world(), opts)

      expect(result.refused).toBe(false)
      expect(result.teams.flatMap((t) => t.memberIds)).not.toContain("u1")

      return result.warnings
    }

    it("a project with no team", () => {
      expect(warned("u1,Alice Doe,Vision Pipeline,", BOB_FREE)).toEqual([
        "Row 2: Alice Doe has a project but no team, and is left unassigned.",
      ])
    })

    it("a team with no project", () => {
      expect(warned("u1,Alice Doe,,Team VP", BOB_FREE)).toEqual([
        "Row 2: Alice Doe has a team but no project, and is left unassigned.",
      ])
    })

    it("a project that is not on this page", () => {
      expect(warned("u1,Alice Doe,Weather Bot,Team WB", BOB_FREE)).toEqual([
        'Row 2: no project on this page is called "Weather Bot", so Alice Doe is left unassigned.',
      ])
    })

    it("a team name too short to save", () => {
      expect(warned("u1,Alice Doe,Vision Pipeline,A", BOB_FREE)).toEqual([
        'Row 2: team "A" needs at least 3 characters, so Alice Doe is left unassigned.',
      ])
    })

    it("a second row for the same person, using neither", () => {
      expect(
        warned(
          "u1,Alice Doe,Vision Pipeline,Team VP",
          BOB_FREE,
          "u1,Alice Doe,Chat Agent,Team CA",
        ),
      ).toEqual([
        "Row 4: Alice Doe appears more than once, and is left unassigned.",
      ])
    })

    it("no row at all, in one line for everyone missing", () => {
      expect(warned(BOB_FREE)).toEqual([
        "1 person has no row in the file and is left unassigned: Alice Doe.",
      ])
    })

    it("a truncated row, whose person then counts as missing", () => {
      expect(warned("u1,Alice Doe", BOB_FREE)).toEqual([
        "Row 2: too few columns to read.",
        "1 person has no row in the file and is left unassigned: Alice Doe.",
      ])
    })
  })

  it("names a row for somebody it cannot place, and applies the rest", () => {
    const result = applyAssignmentCsv(
      file(
        "u1,Alice Doe,Vision Pipeline,Team VP",
        BOB_FREE,
        "u9,Carol Jones,Vision Pipeline,Team VP",
      ),
      world(),
      opts,
    )

    expect(result.warnings).toEqual([
      "Row 4: Carol Jones is not somebody this page can place.",
    ])
    expect(shape(result.teams)).toEqual([["p1", "Team VP", ["u1"]]])
  })

  it("lists many missing people in one line", () => {
    const crowd = Array.from({ length: 5 }, (_, i) => ({
      id: `x${i}`,
      name: `Person ${i}`,
    }))
    const result = applyAssignmentCsv(
      file("x0,Person 0,,"),
      world({ people: crowd, teams: [] }),
      opts,
    )

    expect(result.warnings).toEqual([
      "4 people have no row in the file and are left unassigned: Person 1, " +
        "Person 2, Person 3 and 1 more.",
    ])
  })

  describe("refuses, changing nothing, only a file it cannot read", () => {
    const refused = (text: string) => {
      const result = applyAssignmentCsv(text, world(), opts)

      expect(result.refused).toBe(true)
      expect(result.teams).toEqual(world().teams)

      return result.problems
    }

    it("an empty file", () => {
      expect(refused("")).toEqual(["That file is empty."])
    })

    it("a file without the columns it reads", () => {
      expect(refused("name,email\r\nAlice,a@example.com\r\n")[0]).toContain(
        "needs a user_id",
      )
    })
  })
})
