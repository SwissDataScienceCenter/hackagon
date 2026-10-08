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
  projectTitle: "project_title",
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
  /**
   * The number of the project their team belongs to, as the page shows it;
   * empty when they are unassigned.
   */
  project: string
  /** That project's title, for reading and for catching a stale number. */
  projectTitle: string
  /** Their team's name; empty when they are unassigned. */
  team: string
  /** The projects they said they wanted, as the page's numbers. */
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
 * Projects go out as the numbers the page shows — in `project` and in
 * `prefers` alike — because that is what an organizer types and compares
 * against the screen. `project_title` rides beside the number so the file
 * reads on its own, and so an upload can tell when the numbering has moved.
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
    COLUMNS.projectTitle,
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
          r.projectTitle,
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
  /** The projects with a row on the page, with the number each row shows. */
  projects: readonly { id: string; title: string; number: number }[]
  /** The workspace as it stands. Copied, never mutated. */
  teams: readonly PlannedTeam[]
}

export interface ImportResult {
  /** The teams the file describes — the ones it was given, if refused. */
  teams: PlannedTeam[]
  /** True when the file could not be read at all, so nothing was applied. */
  refused: boolean
  /** People the file put on a team. */
  assigned: number
  /** People who end up on no team. */
  unassigned: number
  /** Teams left holding more than `max`. */
  oversized: string[]
  /** Why the file could not be read. Empty unless `refused`. */
  problems: string[]
  /**
   * Rows that could not be used, and people with no row — each of them ends up
   * unassigned. One line each, in the order met; missing people last, together.
   */
  warnings: string[]
}

/**
 * Read an edited file back as the whole team assignment.
 *
 * **The file replaces every team.** The teams it names are the teams there
 * are afterwards, each a new one; whatever was on the page before is gone once
 * saved. An organizer who wants a name changed renames the team on the page.
 *
 * **An assignment is a person, a project and a team.** The project is the
 * number the page shows (a title still works, matched ignoring case); the
 * team is any name at all, even one character, and the same name on the same
 * project is the same team.
 *
 * Anything short of that is not an assignment, and the person **ends up
 * unassigned** — never left wherever they were, because the file replaces
 * everything:
 *
 * - a row with neither project nor team: that is simply how the download writes
 *   somebody without a team, so it is not worth a warning;
 * - a row with a mistake in it — one of the two missing, an unknown project, a
 *   number whose `project_title` no longer matches, a second row for the same
 *   person — is warned about;
 * - somebody with no row at all is warned about too: most likely they joined
 *   after the download, but a trimmed file looks the same.
 *
 * Only a file that cannot be read as an assignment at all — empty, or without
 * the columns it needs — is refused. Everything else is applied and left
 * unsaved, so Discard undoes it. Row numbers are the spreadsheet's, counting
 * the header as row 1.
 */
export function applyAssignmentCsv(
  text: string,
  world: ImportWorld,
  { max }: { max: number },
): ImportResult {
  const problems: string[] = []
  const refuse = (): ImportResult => ({
    teams: world.teams.map((t) => ({ ...t, memberIds: [...t.memberIds] })),
    refused: true,
    assigned: 0,
    unassigned: 0,
    oversized: [],
    problems,
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
  // Optional: only a downloaded file has it, and it is only a check.
  const titleAt = columnAt(COLUMNS.projectTitle)
  if (idAt === -1 || projectAt === -1 || teamAt === -1) {
    problems.push(
      `That file needs a ${COLUMNS.userId}, a ${COLUMNS.project} and a ` +
        `${COLUMNS.team} column. Download the current assignment and edit that.`,
    )

    return refuse()
  }
  const widthNeeded = Math.max(idAt, projectAt, teamAt)

  const nameById = new Map(world.people.map((p) => [p.id, p.name]))
  const projectByNumber = new Map(
    world.projects.map((p) => [String(p.number), p]),
  )
  const projectByTitle = new Map(
    world.projects.map((p) => [p.title.trim().toLowerCase(), p]),
  )
  const sameTitle = (a: string, b: string) =>
    a.trim().toLowerCase() === b.trim().toLowerCase()

  const warnings: string[] = []
  /** Who goes where, by user id, for every row that is a usable assignment. */
  const plan = new Map<string, { projectId: string; team: string }>()
  /** Everyone with a row, usable or not — so not also reported as missing. */
  const seen = new Set<string>()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const line = i + 1
    const cell = (n: number) => (row[n] ?? "").trim()

    // Genuinely truncated, not merely blank at the end. Whoever it was meant
    // for has no usable row, and is reported as missing below.
    if (row.length <= widthNeeded) {
      warnings.push(`Row ${line}: too few columns to read.`)
      continue
    }

    const userId = cell(idAt)
    const who = nameById.get(userId)
    if (who === undefined) {
      const named = (nameAt === -1 ? "" : cell(nameAt)) || userId
      warnings.push(
        named === ""
          ? `Row ${line}: no ${COLUMNS.userId}.`
          : `Row ${line}: ${named} is not somebody this page can place.`,
      )
      continue
    }
    if (seen.has(userId)) {
      // Which of the two was meant is a guess, so neither is used.
      plan.delete(userId)
      warnings.push(
        `Row ${line}: ${who} appears more than once, and is left unassigned.`,
      )
      continue
    }
    seen.add(userId)

    const named = cell(projectAt)
    const teamName = cell(teamAt)
    if (named === "" && teamName === "") continue
    if (teamName === "") {
      warnings.push(
        `Row ${line}: ${who} has a ${COLUMNS.project} but no ${COLUMNS.team}, and is left unassigned.`,
      )
      continue
    }
    if (named === "") {
      warnings.push(
        `Row ${line}: ${who} has a ${COLUMNS.team} but no ${COLUMNS.project}, and is left unassigned.`,
      )
      continue
    }

    // A number, as the page shows it — or a title, which is what a file from
    // before the numbers carries, and is never ambiguous.
    const isNumber = /^\d+$/.test(named)
    const project = isNumber
      ? projectByNumber.get(String(Number(named)))
      : projectByTitle.get(named.toLowerCase())
    if (project === undefined) {
      warnings.push(
        isNumber
          ? `Row ${line}: no project on this page has number ${named}, so ${who} is left unassigned.`
          : `Row ${line}: no project on this page is called "${named}", so ${who} is left unassigned.`,
      )
      continue
    }

    // Numbers follow the order of the approved projects, so approving or
    // rejecting one after the download shifts every number after it. The title
    // the download wrote beside the number catches that: a mismatch means the
    // number no longer names what the organizer saw.
    const writtenTitle = titleAt === -1 ? "" : cell(titleAt)
    if (
      isNumber &&
      writtenTitle !== "" &&
      !sameTitle(writtenTitle, project.title)
    ) {
      warnings.push(
        `Row ${line}: project ${named} is now "${project.title}", not "${writtenTitle}" — ` +
          `the file may be out of date, so ${who} is left unassigned.`,
      )
      continue
    }

    plan.set(userId, { projectId: project.id, team: teamName })
  }

  // One line for everyone missing: a cut-down file is missing dozens, not one.
  const missing = world.people.filter((p) => !seen.has(p.id))
  if (missing.length > 0) {
    const shown = missing.slice(0, 3).map((p) => p.name)
    const rest = missing.length - shown.length
    warnings.push(
      `${missing.length} ${missing.length === 1 ? "person has" : "people have"} ` +
        `no row in the file and ${missing.length === 1 ? "is" : "are"} left ` +
        `unassigned: ${shown.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}.`,
    )
  }

  // Every team is new: the file replaces what was there, it does not edit it.
  const teams: PlannedTeam[] = []
  for (const [userId, assignment] of plan) {
    let target = teams.find(
      (t) =>
        t.projectId === assignment.projectId &&
        t.name.toLowerCase() === assignment.team.toLowerCase(),
    )
    if (target === undefined) {
      target = {
        key: `csv-${teams.length}`,
        id: null,
        projectId: assignment.projectId,
        name: assignment.team,
        memberIds: [],
      }
      teams.push(target)
    }
    target.memberIds.push(userId)
  }

  return {
    teams,
    refused: false,
    assigned: plan.size,
    unassigned: world.people.length - plan.size,
    oversized: teams.filter((t) => t.memberIds.length > max).map((t) => t.name),
    problems,
    warnings,
  }
}
