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
  /** The workspace the file asks for — the one it was given, if refused. */
  teams: PlannedTeam[]
  /** True when nothing was applied: the file had a problem anywhere in it. */
  refused: boolean
  /** Assignments read and applied. */
  read: number
  /** People whose team the file changed. */
  moved: number
  /** People who had a team before and have none now. */
  unassigned: number
  /** Teams the file named that did not exist yet. */
  created: string[]
  /** Teams the file left with nobody in them, and so removed. */
  removed: string[]
  /** Teams left holding more than `max`. */
  oversized: string[]
  /** What could not be read, one line each, in the order it was met. */
  problems: string[]
  /** Worth knowing but not wrong — the file was still applied. */
  warnings: string[]
}

/** One person's line in the file, once read. `null` assigns them nowhere. */
type Assignment = { projectId: string; team: string } | null

/**
 * Read an edited file back as the whole team assignment.
 *
 * **The file is the assignment.** Whoever it puts on a team is on that team;
 * a row with neither `project` nor `team` ends up unassigned, and a team the
 * file leaves with nobody in it is removed. Every participant on a team needs
 * a row — a missing one is a problem, not an unassignment; one who is not on a
 * team may be missing, and stays unassigned. There
 * is deliberately no "only these rows" mode: the download always carries
 * everyone with their current team, so changing a few rows of it already does
 * that, and one rule is easier to trust than two.
 *
 * **An assignment is a row with both a `project` and a `team`.** The project
 * is a title from the page, matched ignoring case; the team is any name. A
 * name that matches a team already on that project joins it, keeping its id
 * and so its submissions; any other name creates a team, as `+ Add Team`
 * would, which the organizer can rename on the page before saving.
 *
 * A row with neither is not a mistake — it is how the download writes
 * everyone without a team, so an unedited download reads back cleanly. A row
 * with one but not the other is: guessing whether it meant "unassign" or "I
 * forgot the team" is how a file quietly does the wrong thing.
 *
 * **All or nothing.** Because the file replaces every assignment, one bad row
 * would otherwise quietly leave that person unassigned; any problem refuses
 * the whole file instead. And the result is unsaved like every other edit on
 * the page, so Discard undoes it. Row numbers are the spreadsheet's, counting
 * the header as row 1.
 */
export function applyAssignmentCsv(
  text: string,
  world: ImportWorld,
  { max }: { max: number },
): ImportResult {
  const copy = () =>
    world.teams.map((t) => ({ ...t, memberIds: [...t.memberIds] }))
  const problems: string[] = []
  const refuse = (): ImportResult => ({
    teams: copy(),
    refused: true,
    read: 0,
    moved: 0,
    unassigned: 0,
    created: [],
    removed: [],
    oversized: [],
    problems,
    // A refused file has nothing worth warning about: the problems come first.
    warnings: [],
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

  // Every row is read before anything is applied, so a problem anywhere can
  // refuse the file while the workspace is still untouched.
  const plan = new Map<string, Assignment>()
  const seen = new Set<string>()
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const line = i + 1
    const cell = (n: number) => (row[n] ?? "").trim()

    // Genuinely truncated, not merely blank at the end: without this a row
    // that lost its team column would read as "no assignment", silently.
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
      problems.push(`Row ${line}: ${who} appears more than once.`)
      continue
    }
    // Has a row, right or wrong — so not also reported as missing.
    seen.add(userId)

    const title = cell(projectAt)
    const teamName = cell(teamAt)
    if (title === "" && teamName === "") {
      plan.set(userId, null)
      continue
    }
    if (teamName === "") {
      problems.push(
        `Row ${line}: ${who} has a ${COLUMNS.project} but no ${COLUMNS.team}; an assignment needs both.`,
      )
      continue
    }
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

    plan.set(userId, { projectId: project.id, team: teamName })
  }

  // Somebody with no row at all. If they are on a team now, the file is
  // trimmed or out of date, and applying it would quietly take them off it —
  // a problem. If they are not, they most likely joined after the download
  // was made: they stay unassigned, which is what they are, and the organizer
  // is told. One line each way: a cut-down file is missing dozens, not one.
  const placed = new Set(world.teams.flatMap((t) => t.memberIds))
  const missing = world.people.filter((p) => !seen.has(p.id))
  const onATeam = missing.filter((p) => placed.has(p.id))
  const newcomers = missing.filter((p) => !placed.has(p.id))
  const names = (list: readonly { name: string }[]) => {
    const shown = list.slice(0, 3).map((p) => p.name)
    const rest = list.length - shown.length

    return `${shown.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`
  }
  if (onATeam.length > 0) {
    problems.push(
      `${onATeam.length} ${onATeam.length === 1 ? "person who is" : "people who are"} ` +
        `on a team ${onATeam.length === 1 ? "has" : "have"} no row in the file: ` +
        `${names(onATeam)}. Every participant needs a row; leave ` +
        `${COLUMNS.project} and ${COLUMNS.team} empty to unassign someone.`,
    )
  }
  const warnings: string[] = []
  if (newcomers.length > 0) {
    warnings.push(
      `${newcomers.length} unassigned ${newcomers.length === 1 ? "person has" : "people have"} ` +
        `no row in the file, perhaps because they joined after it was ` +
        `downloaded: ${names(newcomers)}. They stay unassigned.`,
    )
  }

  if (problems.length > 0) return refuse()

  const teamOf = (list: readonly PlannedTeam[]) => {
    const where = new Map<string, string>()
    for (const t of list) for (const m of t.memberIds) where.set(m, t.key)

    return where
  }
  const before = teamOf(world.teams)

  // From nobody on any team; the file then says who is.
  const teams = copy().map((t) => ({ ...t, memberIds: [] as string[] }))
  const usedKeys = new Set(teams.map((t) => t.key))
  const created: string[] = []
  let read = 0
  for (const [userId, assignment] of plan) {
    if (assignment === null) continue

    let target = teams.find(
      (t) =>
        t.projectId === assignment.projectId &&
        t.name.toLowerCase() === assignment.team.toLowerCase(),
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
        projectId: assignment.projectId,
        name: assignment.team,
        memberIds: [],
      }
      teams.push(target)
      created.push(assignment.team)
    }

    read++
    target.memberIds.push(userId)
  }

  // A team the file leaves with nobody is not part of the assignment. Removed
  // from the workspace only: Save deletes a saved one, and Discard brings it
  // back.
  const removed = teams.filter((t) => t.memberIds.length === 0)
  const kept = teams.filter((t) => t.memberIds.length > 0)

  const after = teamOf(kept)
  let moved = 0
  let unassigned = 0
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(id) !== after.get(id)) moved++
    if (before.has(id) && !after.has(id)) unassigned++
  }

  return {
    teams: kept,
    refused: false,
    read,
    moved,
    unassigned,
    created,
    removed: removed.map((t) => t.name),
    oversized: kept.filter((t) => t.memberIds.length > max).map((t) => t.name),
    problems,
    warnings,
  }
}
