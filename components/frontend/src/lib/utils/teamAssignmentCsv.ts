import { csvRow, parseCsv } from "./csv"
import type { PlannedTeam } from "./teamDistribution"

/**
 * The team-assignment file, both directions.
 *
 * Dragging a hundred people into fifteen projects is a lot of dragging, so the
 * assignment can leave the screen as a CSV, be worked out in a spreadsheet, and
 * come back. One module writes it and reads it, because a format defined in two
 * places is one that drifts — and this one is handed to a person and then taken
 * back from them, which is exactly when drift shows.
 *
 * **`project` and `team` are the only columns that mean anything on the way
 * back in.** Everything else is context for deciding: who this is, what they
 * asked for, what they said about themselves. Columns are read by header name,
 * so an organizer may reorder them, add their own, or delete the ones they do
 * not want to look at.
 */

/** The columns read on the way back in. Lower-case; matching ignores case. */
export const COLUMNS = {
  userId: "user_id",
  name: "name",
  project: "project",
  team: "team",
  prefers: "prefers",
} as const

/** A registration question, as a column of the file. */
export interface AssignmentQuestion {
  /** Unique per hackathon, and how `AssignmentRow.answers` is keyed. */
  key: string
  /** What the column is headed — two questions may share one. */
  label: string
}

/** One participant, as a row. */
export interface AssignmentRow {
  userId: string
  name: string
  /** The project their team belongs to; empty when they are unassigned. */
  project: string
  /** Their team's name; empty when they are unassigned. */
  team: string
  /** The projects they said they wanted, as titles. */
  prefers: string[]
  /** Their answer, by question key. A question they skipped is absent. */
  answers: Record<string, string>
}

/**
 * The file as it goes out.
 *
 * Every question gets a column carrying the answer in full, which is the
 * opposite of what the assignment screen does with the same data — there, space
 * is what there is least of and an answer is a two-character code. Here there is
 * a whole column, so spelling it out costs nothing and reads better.
 *
 * `prefers` joins with `; ` rather than `, ` so the cell stays legible in a
 * spreadsheet that has just been told the file is comma-separated.
 */
export function assignmentCsv(
  rows: readonly AssignmentRow[],
  questions: readonly AssignmentQuestion[],
): string {
  const header = [
    COLUMNS.userId,
    COLUMNS.name,
    COLUMNS.project,
    COLUMNS.team,
    COLUMNS.prefers,
    ...questions.map((q) => q.label),
  ]

  return (
    csvRow(header) +
    rows
      .map((r) =>
        csvRow([
          r.userId,
          r.name,
          r.project,
          r.team,
          r.prefers.join("; "),
          ...questions.map((q) => r.answers[q.key] ?? ""),
        ]),
      )
      .join("")
  )
}

/** What the import has to place people into, and against. */
export interface ImportWorld {
  /** Everybody this page can put on a team. */
  people: readonly { id: string; name: string }[]
  /** The projects with a row on the page — approved ones, by title. */
  projects: readonly { id: string; title: string }[]
  /** The workspace as it stands. Copied, never mutated. */
  teams: readonly PlannedTeam[]
}

export interface ImportResult {
  /** The workspace the file asks for. */
  teams: PlannedTeam[]
  /** Rows naming somebody this page can place. */
  read: number
  /** People whose team the file changed. */
  moved: number
  /** People the file said nothing about, and who were therefore left alone. */
  absent: number
  /** Teams the file named that did not exist yet. */
  created: string[]
  /** Teams left holding more than `max`. */
  oversized: string[]
  /** What could not be read, one line each, in the order it was met. */
  problems: string[]
}

/**
 * Read an edited file back onto the workspace.
 *
 * Four rules, and they are all about doing as little as the file actually asks:
 *
 * 1. **A blank `team` unassigns.** That is how somebody is taken off a team,
 *    and it is why `project` is only consulted when `team` says something.
 * 2. **A team named but not found is created**, exactly as `+ Add Team` would.
 *    Which is also why a *rename* cannot be expressed here: the old name is
 *    simply a team nobody is on any more. Rename on screen.
 * 3. **A row that is not in the file changes nothing.** The file speaks about
 *    the rows it contains and about no others.
 * 4. **Nothing is deleted.** A team everybody left stays, empty, for the
 *    organizer to delete on screen if they meant to.
 *
 * Together those make the import strictly non-destructive, which is what an
 * escape hatch should be: worst case it moves people, and the workspace it
 * returns is unsaved like every other edit on that page.
 *
 * A row this cannot read is reported and skipped — one bad line does not cost
 * the other ninety-nine. Row numbers are the spreadsheet's, counting the header
 * as row 1.
 */
export function applyAssignmentCsv(
  text: string,
  world: ImportWorld,
  { max }: { max: number },
): ImportResult {
  const teams: PlannedTeam[] = world.teams.map((t) => ({
    ...t,
    memberIds: [...t.memberIds],
  }))
  const problems: string[] = []
  const created: string[] = []
  const refuse = (): ImportResult => ({
    teams,
    read: 0,
    moved: 0,
    absent: world.people.length,
    created,
    oversized: [],
    problems,
  })

  const rows = parseCsv(text)
  const header = rows[0]
  if (header === undefined) {
    problems.push("That file is empty.")

    return refuse()
  }

  const columnAt = (name: string) =>
    header.findIndex((h) => h.trim().toLowerCase() === name)
  const idAt = columnAt(COLUMNS.userId)
  const projectAt = columnAt(COLUMNS.project)
  const teamAt = columnAt(COLUMNS.team)
  const nameAt = columnAt(COLUMNS.name)
  if (idAt === -1 || projectAt === -1 || teamAt === -1) {
    problems.push(
      `That file needs a ${COLUMNS.userId}, a ${COLUMNS.project} and a ` +
        `${COLUMNS.team} column. Download the current assignment and edit that.`,
    )

    return refuse()
  }
  const widthNeeded = Math.max(idAt, projectAt, teamAt)

  const nameById = new Map(world.people.map((p) => [p.id, p.name]))
  const projectByTitle = new Map(
    world.projects.map((p) => [p.title.trim().toLowerCase(), p]),
  )
  const usedKeys = new Set(teams.map((t) => t.key))
  const teamOf = (list: readonly PlannedTeam[]) => {
    const where = new Map<string, string>()
    for (const t of list) for (const m of t.memberIds) where.set(m, t.key)

    return where
  }
  const before = teamOf(teams)

  const seen = new Set<string>()
  let read = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const line = i + 1
    const cell = (n: number) => (row[n] ?? "").trim()

    // Genuinely truncated, not merely blank at the end: without this a row that
    // lost its team column would read as "unassign them", silently.
    if (row.length <= widthNeeded) {
      problems.push(`Row ${line}: too few columns to read.`)
      continue
    }

    const userId = cell(idAt)
    if (userId === "") {
      problems.push(`Row ${line}: no ${COLUMNS.userId}.`)
      continue
    }

    const who = nameById.get(userId)
    if (who === undefined) {
      const named = (nameAt === -1 ? "" : cell(nameAt)) || userId
      problems.push(
        `Row ${line}: ${named} is not somebody this page can place.`,
      )
      continue
    }
    if (seen.has(userId)) {
      problems.push(
        `Row ${line}: ${who} appears more than once; the first won.`,
      )
      continue
    }
    seen.add(userId)

    let target: PlannedTeam | undefined
    const teamName = cell(teamAt)
    if (teamName !== "") {
      const title = cell(projectAt)
      if (title === "") {
        problems.push(
          `Row ${line}: ${who} is on "${teamName}", but no ${COLUMNS.project} says which.`,
        )
        continue
      }
      const project = projectByTitle.get(title.toLowerCase())
      if (project === undefined) {
        problems.push(
          `Row ${line}: no project on this page is called "${title}".`,
        )
        continue
      }

      target = teams.find(
        (t) =>
          t.projectId === project.id &&
          t.name.toLowerCase() === teamName.toLowerCase(),
      )
      if (target === undefined) {
        // Past any key the workspace already holds, so a second import onto the
        // result of a first cannot hand out a key that is in use.
        let n = 0
        while (usedKeys.has(`csv-${n}`)) n++
        usedKeys.add(`csv-${n}`)
        target = {
          key: `csv-${n}`,
          id: null,
          projectId: project.id,
          name: teamName,
          memberIds: [],
        }
        teams.push(target)
        created.push(teamName)
      }
    }

    read++
    // Leave before joining, so nobody is briefly on two teams and an unchanged
    // row is a no-op rather than a duplicate.
    for (const t of teams) {
      const held = t.memberIds.indexOf(userId)
      if (held !== -1) t.memberIds.splice(held, 1)
    }
    target?.memberIds.push(userId)
  }

  const after = teamOf(teams)
  let moved = 0
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(id) !== after.get(id)) moved++
  }

  return {
    teams,
    read,
    moved,
    absent: world.people.filter((p) => !seen.has(p.id)).length,
    created,
    oversized: teams.filter((t) => t.memberIds.length > max).map((t) => t.name),
    problems,
  }
}
