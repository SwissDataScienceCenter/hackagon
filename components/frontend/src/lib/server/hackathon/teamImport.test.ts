import { describe, it, expect } from "vitest"
import {
  IMPORT_COLUMNS,
  buildTemplate,
  parseRosterFile,
  resolveImport,
  templateRows,
  type ImportWorld,
  type PlannedRow,
  type RosterRow,
} from "./teamImport"

// The fixture mirrors the shape of the seeded h1: two projects, one staffed
// team, one empty team, a participant with no team and one still waitlisted.
const ALICE = "alice@mail.com"
const BOB = "bob@mail.org"
const ADMIN = "admin@hackagon.dev"
const CHARLES = "charles@mail.net"

function world(): ImportWorld {
  return {
    participants: [
      { id: "u-alice", email: ALICE, name: "Alice Wonderland", isWaiting: false },
      { id: "u-bob", email: BOB, name: "Bob Henderson", isWaiting: false },
      { id: "u-admin", email: ADMIN, name: "Hackagon Admin", isWaiting: false },
      { id: "u-charles", email: CHARLES, name: "Charles Whitfield", isWaiting: true },
    ],
    projects: [
      { id: "p-automl", title: "AutoML Pipeline Builder" },
      { id: "p-chatbot", title: "Multilingual Chatbot" },
    ],
    teams: [
      {
        id: "t-alpha",
        name: "Team Alpha",
        projectId: "p-automl",
        memberIds: ["u-alice", "u-admin"],
      },
      { id: "t-beta", name: "Team Beta", projectId: "p-chatbot", memberIds: [] },
    ],
  }
}

/** Rows as the file's own columns, so a test reads like the spreadsheet. */
function rows(...triples: [string, string, string][]): RosterRow[] {
  return triples.map(([userEmail, project, team], i) => ({
    row: i + 1,
    userEmail,
    project,
    team,
  }))
}

/** The planned row for one email, or a thrown explanation. */
function forEmail(plan: { rows: PlannedRow[] }, email: string): PlannedRow {
  const r = plan.rows.find((p) => p.email.toLowerCase() === email.toLowerCase())
  if (!r) {
    throw new Error(
      `no planned row for ${email}; the plan covers ${plan.rows.map((p) => p.email).join(", ")}`,
    )
  }

  return r
}

/** Rows of a parse expected to succeed. */
function parsed(text: string, filename = "roster.csv"): RosterRow[] {
  const r = parseRosterFile(text, filename)
  if (!r.ok) throw new Error(`expected a parse, got: ${r.message}`)

  return r.rows
}

/** The message of a parse expected to fail. */
function parseError(text: string, filename = "roster.csv"): string {
  const r = parseRosterFile(text, filename)
  if (r.ok) throw new Error(`expected a failure, got ${r.rows.length} rows`)

  return r.message
}

describe("the template", () => {
  it("has exactly the three columns the importer reads, in order", () => {
    const header = buildTemplate(world(), "csv").split("\r\n")[0]

    expect(header).toBe('"user_email","project","team"')
    expect(IMPORT_COLUMNS).toEqual(["user_email", "project", "team"])
  })

  it("fills in the real project and team of everyone already placed", () => {
    const alice = templateRows(world()).find((r) => r.user_email === ALICE)

    // Real values, from this event — a template carrying invented project names
    // teaches the wrong ones.
    expect(alice).toEqual({
      user_email: ALICE,
      project: "AutoML Pipeline Builder",
      team: "Team Alpha",
    })
  })

  it("leaves project and team blank for someone with no team", () => {
    const bob = templateRows(world()).find((r) => r.user_email === BOB)

    expect(bob).toEqual({ user_email: BOB, project: "", team: "" })
  })

  it("puts the filled-in rows first and the blanks after them", () => {
    const emails = templateRows(world()).map((r) => r.user_email)

    // Alice and the admin are on Team Alpha; Bob is not on anything.
    expect(emails).toEqual([ALICE, ADMIN, BOB])
  })

  it("leaves waitlisted participants out — they cannot be given a team yet", () => {
    expect(templateRows(world()).map((r) => r.user_email)).not.toContain(CHARLES)
  })

  it("falls back to example rows, on a REAL project, when nobody is confirmed", () => {
    const empty: ImportWorld = { ...world(), participants: [], teams: [] }

    expect(templateRows(empty)).toEqual([
      {
        user_email: "first.participant@example.org",
        project: "AutoML Pipeline Builder",
        team: "Team APB",
      },
      {
        user_email: "second.participant@example.org",
        project: "AutoML Pipeline Builder",
        team: "Team APB",
      },
    ])
  })
})

// The guard that matters most: a template its own importer cannot read, or
// reads as a pile of changes, is a silent failure the moment a real organiser
// downloads one. Both formats, both halves — parses AND resolves to nothing.
describe("the template round trip", () => {
  for (const format of ["csv", "json"] as const) {
    it(`parses back from ${format} and asks for no changes at all`, () => {
      const w = world()

      // Positive control. Without it this test agrees with an empty template,
      // an empty world, and a resolver that plans nothing for anyone.
      const assigned = templateRows(w).filter((r) => r.team !== "")
      const blank = templateRows(w).filter((r) => r.team === "")
      expect(
        assigned.length,
        "the fixture must place someone, or 'no changes' proves nothing",
      ).toBeGreaterThan(0)
      expect(
        blank.length,
        "the fixture must leave someone unplaced, or blank rows are never exercised",
      ).toBeGreaterThan(0)

      const back = parsed(buildTemplate(w, format), `teams.${format}`)
      expect(back.length).toBe(assigned.length + blank.length)

      const plan = resolveImport(back, w)
      expect(plan.counts.errors).toBe(0)
      expect(plan.counts.changes).toBe(0)
      expect(plan.counts.unchanged).toBe(back.length)
      expect(plan.creates).toEqual([])
    })
  }

  it("repairs a participant who is somehow on two teams", () => {
    // The DB permits it and the product does not; the seed fixture has exactly
    // this. The template must state ONE team, and re-importing it must remove
    // the other rather than quietly leave the drift in place.
    const w = world()
    w.teams[1]!.memberIds.push("u-alice")

    const alice = templateRows(w).find((r) => r.user_email === ALICE)
    expect(alice?.team, "the alphabetically first team is the one stated").toBe(
      "Team Alpha",
    )

    const plan = resolveImport(parsed(buildTemplate(w, "csv")), w)
    expect(plan.counts.errors).toBe(0)
    const row = forEmail(plan, ALICE)
    expect(row.status).toBe("assign")
    expect(row.detail).toBe('stays on "Team Alpha" and leaves "Team Beta"')
    expect(row.leave).toEqual(["t-beta"])
    // The apply step must NOT re-add her to the team she is already on:
    // `team_participants` is keyed on (user_id, team_id), so that is a
    // constraint violation rather than a no-op.
    expect(row.alreadyOnTarget).toBe(true)
  })
})

describe("reading a CSV", () => {
  it("reads the three columns", () => {
    expect(
      parsed(`user_email,project,team\n${BOB},Multilingual Chatbot,Team Beta\n`),
    ).toEqual([
      { row: 1, userEmail: BOB, project: "Multilingual Chatbot", team: "Team Beta" },
    ])
  })

  it("keeps a quoted comma inside its field", () => {
    const [row] = parsed(
      `user_email,project,team\n${BOB},"Chatbot, Multilingual","Team ""B"""\n`,
    )

    expect(row?.project).toBe("Chatbot, Multilingual")
    expect(row?.team).toBe('Team "B"')
  })

  it("survives a UTF-8 BOM, which is what Excel writes", () => {
    const [row] = parsed(`\uFEFFuser_email,project,team\r\n${BOB},,\r\n`)

    // A BOM'd header cell is "\uFEFFuser_email"; unrecognised, the email column
    // goes missing and every file Excel saves is rejected. NOTE this one passes
    // by two independent routes \u2014 the explicit strip AND `normalizeKey`, which
    // folds any non-alphanumeric away \u2014 so it does NOT pin the strip. The JSON
    // case below is what does; found by mutation, because deleting the strip
    // left this test green.
    expect(row?.userEmail).toBe(BOB)
  })

  it("reads a semicolon-separated file, which is what Excel writes in Europe", () => {
    const [row] = parsed(`user_email;project;team\r\n${BOB};Multilingual Chatbot;Team Beta\r\n`)

    expect(row).toEqual({
      row: 1,
      userEmail: BOB,
      project: "Multilingual Chatbot",
      team: "Team Beta",
    })
  })

  it("names the columns it could not find", () => {
    expect(parseError(`email,squad\n${BOB},Team Beta\n`)).toContain(
      'missing the columns "project", "team"',
    )
  })

  it("refuses a file with a header and nothing under it", () => {
    expect(parseError("user_email,project,team\n")).toBe(
      "the file has a header but no rows",
    )
  })

  it("refuses an empty file", () => {
    expect(parseError("   \n")).toBe("the file is empty")
  })
})

describe("reading a JSON", () => {
  it("reads a bare array", () => {
    expect(
      parsed(
        JSON.stringify([{ user_email: BOB, project: "Multilingual Chatbot", team: "Team Beta" }]),
        "roster.json",
      ),
    ).toEqual([
      { row: 1, userEmail: BOB, project: "Multilingual Chatbot", team: "Team Beta" },
    ])
  })

  it("reads a { rows: [...] } wrapper and camelCase keys", () => {
    const [row] = parsed(
      JSON.stringify({ rows: [{ userEmail: BOB, project: "X", teamName: "Y" }] }),
      "roster.json",
    )

    expect(row).toEqual({ row: 1, userEmail: BOB, project: "X", team: "Y" })
  })

  it("treats an omitted project/team as blank, which means 'no team'", () => {
    const [row] = parsed(JSON.stringify([{ user_email: BOB }]), "roster.json")

    expect(row).toEqual({ row: 1, userEmail: BOB, project: "", team: "" })
  })

  it("reads a JSON file saved with a UTF-8 BOM", () => {
    // `JSON.parse` treats U+FEFF as a syntax error, unlike `String.trim`, which
    // counts it as whitespace — so a BOM'd JSON export fails on its first
    // character with a message about position 0 and nothing else. This is the
    // case the explicit BOM strip exists for.
    const [row] = parsed(
      `\uFEFF${JSON.stringify([{ user_email: BOB, project: "P", team: "T" }])}`,
      "roster.json",
    )

    expect(row).toEqual({ row: 1, userEmail: BOB, project: "P", team: "T" })
  })

  it("reads JSON out of a file named .csv rather than as one wide column", () => {
    expect(parsed(JSON.stringify([{ user_email: BOB }]), "roster.csv")[0]?.userEmail).toBe(BOB)
  })

  it("says which row is not an object", () => {
    expect(parseError(JSON.stringify([{ user_email: BOB }, "nope"]), "r.json")).toBe(
      "row 2 is not an object",
    )
  })

  it("refuses a project given as a list", () => {
    expect(
      parseError(JSON.stringify([{ user_email: BOB, project: ["a", "b"] }]), "r.json"),
    ).toBe('row 1: "project" must be text, not a list')
  })
})

describe("resolving a file against the event", () => {
  it("plans a join onto an existing team", () => {
    const plan = resolveImport(rows([BOB, "Multilingual Chatbot", "Team Beta"]), world())

    expect(plan.counts.errors).toBe(0)
    expect(forEmail(plan, BOB)).toMatchObject({
      status: "assign",
      detail: 'joins "Team Beta" (Multilingual Chatbot)',
      userId: "u-bob",
      target: "t-beta",
      leave: [],
    })
    // A genuine join DOES need writing — the flag is not always set.
    expect(forEmail(plan, BOB).alreadyOnTarget).toBe(false)
  })

  it("matches the email and the names case-insensitively", () => {
    const plan = resolveImport(
      rows(["  BOB@Mail.ORG ", "multilingual chatbot", "team beta"]),
      world(),
    )

    expect(forEmail(plan, BOB)).toMatchObject({ status: "assign", target: "t-beta" })
  })

  it("creates a team the event does not have yet, ONCE for however many rows name it", () => {
    const plan = resolveImport(
      rows(
        [BOB, "Multilingual Chatbot", "Team Gamma"],
        [ADMIN, "Multilingual Chatbot", "Team Gamma"],
      ),
      world(),
    )

    expect(plan.counts.errors).toBe(0)
    expect(plan.creates).toEqual([
      { projectId: "p-chatbot", projectTitle: "Multilingual Chatbot", name: "Team Gamma" },
    ])
    expect(forEmail(plan, BOB)).toMatchObject({
      status: "create",
      target: "new:0",
      detail: 'joins a new team "Team Gamma" under "Multilingual Chatbot"',
    })
    // The admin is on Team Alpha today, so joining the new team means leaving it.
    expect(forEmail(plan, ADMIN)).toMatchObject({ target: "new:0", leave: ["t-alpha"] })
  })

  it("moves someone off their old team on the way to the new one", () => {
    const plan = resolveImport(rows([ALICE, "Multilingual Chatbot", "Team Beta"]), world())

    expect(forEmail(plan, ALICE)).toMatchObject({
      status: "assign",
      detail: 'moves from "Team Alpha" to "Team Beta"',
      target: "t-beta",
      leave: ["t-alpha"],
    })
  })

  it("takes someone off their team when both columns are blank", () => {
    const plan = resolveImport(rows([ALICE, "", ""]), world())

    expect(forEmail(plan, ALICE)).toMatchObject({
      status: "unassign",
      detail: 'leaves "Team Alpha"',
      target: null,
      leave: ["t-alpha"],
    })
  })

  it("plans nothing for someone the file does not mention", () => {
    const plan = resolveImport(rows([BOB, "", ""]), world())

    // Absent means untouched: the admin keeps Team Alpha because no row says
    // otherwise. A file covering five people must never empty the other forty.
    expect(plan.rows.map((r) => r.email)).toEqual([BOB])
    expect(plan.counts.changes).toBe(0)
  })

  it("counts a change per row and a create per team", () => {
    const plan = resolveImport(
      rows(
        [BOB, "Multilingual Chatbot", "Team Gamma"],
        [ADMIN, "Multilingual Chatbot", "Team Gamma"],
        [ALICE, "", ""],
      ),
      world(),
    )

    expect(plan.counts).toMatchObject({
      total: 3,
      errors: 0,
      assign: 0,
      create: 2,
      unassign: 1,
      unchanged: 0,
      changes: 3,
    })
    expect(plan.creates.length).toBe(1)
  })
})

describe("the rows a file can get wrong", () => {
  it("names an email that belongs to no participant", () => {
    const plan = resolveImport(
      rows(["nobody@example.org", "Multilingual Chatbot", "Team Beta"]),
      world(),
    )

    expect(forEmail(plan, "nobody@example.org")).toMatchObject({
      status: "error",
      detail: 'no participant of this hackathon has the email "nobody@example.org"',
    })
    expect(plan.counts.errors).toBe(1)
  })

  it("names a project this event does not have", () => {
    const plan = resolveImport(rows([BOB, "Quantum Blockchain", "Team Beta"]), world())

    // A different answer to a different question: the person is fine, the
    // project is not, and "row failed" would leave the organiser guessing which.
    expect(forEmail(plan, BOB)).toMatchObject({
      status: "error",
      detail: 'no project of this hackathon is titled "Quantum Blockchain"',
    })
  })

  it("names someone who is still on the waiting list", () => {
    const plan = resolveImport(rows([CHARLES, "Multilingual Chatbot", "Team Beta"]), world())

    expect(forEmail(plan, CHARLES).detail).toBe(
      `${CHARLES} is on the waiting list — approve them before putting them on a team`,
    )
  })

  it("rejects BOTH rows when one person appears twice", () => {
    const plan = resolveImport(
      rows(
        [BOB, "Multilingual Chatbot", "Team Beta"],
        [BOB, "AutoML Pipeline Builder", "Team Alpha"],
      ),
      world(),
    )

    // Not "last one wins": that silently picks for them.
    expect(plan.counts.errors).toBe(2)
    for (const r of plan.rows) {
      expect(r.status).toBe("error")
      expect(r.detail).toBe(
        `${BOB} appears on 2 rows — a participant belongs to at most one team`,
      )
    }
  })

  it("refuses a team with no project rather than guessing which project", () => {
    const plan = resolveImport(rows([BOB, "", "Team Beta"]), world())

    expect(forEmail(plan, BOB).detail).toBe(
      'the team "Team Beta" needs a project — put the project title in the project column',
    )
  })

  it("refuses a project with no team rather than inventing a team name", () => {
    const plan = resolveImport(rows([BOB, "Multilingual Chatbot", ""]), world())

    expect(forEmail(plan, BOB).detail).toBe(
      'the project "Multilingual Chatbot" needs a team name — put it in the team column',
    )
  })

  it("refuses an empty email", () => {
    const plan = resolveImport(rows(["", "Multilingual Chatbot", "Team Beta"]), world())

    expect(plan.rows[0]).toMatchObject({
      status: "error",
      detail: "user_email is empty — every row must name a participant",
    })
  })

  it("refuses an ambiguous project title", () => {
    const w = world()
    w.projects.push({ id: "p-clone", title: "Multilingual Chatbot" })
    const plan = resolveImport(rows([BOB, "Multilingual Chatbot", "Team Beta"]), w)

    expect(forEmail(plan, BOB).detail).toBe(
      '2 projects are titled "Multilingual Chatbot" — rename one of them before importing',
    )
  })

  it("refuses an ambiguous team name under one project", () => {
    const w = world()
    w.teams.push({ id: "t-beta2", name: "Team Beta", projectId: "p-chatbot", memberIds: [] })
    const plan = resolveImport(rows([BOB, "Multilingual Chatbot", "Team Beta"]), w)

    expect(forEmail(plan, BOB).detail).toBe(
      '2 teams under "Multilingual Chatbot" are named "Team Beta" — rename one of them before importing',
    )
  })

  it("refuses a team name longer than the column can hold", () => {
    const plan = resolveImport(rows([BOB, "Multilingual Chatbot", "x".repeat(256)]), world())

    expect(forEmail(plan, BOB).detail).toBe(
      "the team name is 256 characters; the limit is 255",
    )
  })

  it("keeps planning the good rows so the organiser sees every problem at once", () => {
    const plan = resolveImport(
      rows(
        [BOB, "Multilingual Chatbot", "Team Beta"],
        ["nobody@example.org", "Multilingual Chatbot", "Team Beta"],
        [ALICE, "Quantum Blockchain", "Team X"],
      ),
      world(),
    )

    // Every row is judged; whether any of it may be APPLIED is the caller's
    // decision, and it says no while errors > 0.
    expect(plan.counts.errors).toBe(2)
    expect(forEmail(plan, BOB).status).toBe("assign")
  })
})
