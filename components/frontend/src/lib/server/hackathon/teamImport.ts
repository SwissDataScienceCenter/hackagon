/**
 * Bulk team composition from a spreadsheet: the file an organiser downloads,
 * fills in and uploads back, and the PLAN it resolves to before anything is
 * written.
 *
 * Pure functions on plain data — no gRPC, no SvelteKit — so every rule below is
 * unit-testable and the round trip (`buildTemplate` → `parseRosterFile` →
 * `resolveImport`) can be asserted directly. A template its own importer
 * rejects is the classic silent failure this split exists to make impossible.
 *
 * ## Why no bulk RPC
 *
 * The plan is executed by composing `TeamService.Create` / `AssignUser` /
 * `RemoveUser`. A bulk handler could not be atomic anyway: team membership is
 * written to TWO stores (the join row and the team-scoped casbin grant) and
 * casbin writes on its own connection, so an ent transaction must never be held
 * across one. `AssignUser` already compensates per user; a bulk RPC would only
 * move the same partial-failure problem behind one call and hide which row
 * failed.
 *
 * ## Semantics, decided once
 *
 * - **A row names a person, not a seat.** `user_email` is matched against the
 *   CONFIRMED participants of this hackathon, case-insensitively.
 * - **Absent means untouched; present-and-blank means unassign.** A participant
 *   with no row in the file keeps whatever team they are on. A participant whose
 *   row has an empty `project` and `team` is taken off every team. That makes a
 *   downloaded template a no-op when uploaded back unchanged, and makes emptying
 *   a team expressible.
 * - **A team belongs to a project, so both columns travel together.** `team`
 *   without `project` is an error rather than a guess, and `project` without
 *   `team` is an error rather than an invented team name.
 * - **A team named in the file that does not exist yet is CREATED**, once, no
 *   matter how many rows name it.
 * - **Validation is all-or-nothing; application is reported.** Every predictable
 *   failure (unknown email, unknown project, duplicate person, missing team
 *   name) is found before a single write, and one bad row blocks the whole file:
 *   a partial import the organiser believes succeeded is the worst outcome. The
 *   writes themselves cannot be atomic (see above), so the apply step reports
 *   what it managed per row instead of claiming success.
 */

/** The three columns, in the order the template writes them. */
export const IMPORT_COLUMNS = ["user_email", "project", "team"] as const

/** Refuse absurd files early — a roster CSV is kilobytes, not megabytes. */
export const MAX_IMPORT_BYTES = 512 * 1024
export const MAX_IMPORT_ROWS = 2000

/** Ent stores `Team.name` as a varchar; keep the error ours, not a 500. */
const MAX_TEAM_NAME = 255

export type ImportFormat = "csv" | "json"

/** One record of the uploaded file, already split into its three columns. */
export interface RosterRow {
  /**
   * Which record this is, counting DATA rows from 1 — not file lines. A CSV's
   * header is not a record and JSON has no header, so "row 3" means the same
   * thing in both formats.
   */
  row: number
  userEmail: string
  project: string
  team: string
}

export type ParseResult =
  | { ok: true; format: ImportFormat; rows: RosterRow[] }
  | { ok: false; message: string }

// ─── The world a file is resolved against ────────────────────────────────────

export interface ImportParticipant {
  id: string
  email: string
  /** Display name, for messages an organiser reads. */
  name: string
  isWaiting: boolean
}

export interface ImportProject {
  id: string
  title: string
}

export interface ImportTeam {
  id: string
  name: string
  projectId: string
  memberIds: string[]
}

export interface ImportWorld {
  participants: ImportParticipant[]
  projects: ImportProject[]
  teams: ImportTeam[]
}

// ─── The plan ────────────────────────────────────────────────────────────────

export type RowStatus = "assign" | "create" | "unassign" | "unchanged" | "error"

export interface PlannedRow {
  row: number
  email: string
  /** Resolved participant's display name, or "" when the email did not resolve. */
  name: string
  project: string
  team: string
  status: RowStatus
  /** One sentence: what will happen, or why it cannot. */
  detail: string
  userId?: string
  /**
   * Where the person ends up: an existing team id, `new:<n>` referring to
   * `creates[n]`, or null to take them off every team.
   */
  target?: string | null
  /** Team ids the person must leave first. */
  leave?: string[]
  /**
   * They are ALREADY on `target`, so only the departures need writing.
   *
   * Not cosmetic: `team_participants` has a composite primary key on
   * `(user_id, team_id)`, so re-adding an existing member is a constraint
   * violation and `AssignUser` answers `Internal` — not a harmless no-op. This
   * is the "stays on X and leaves Y" row, which any participant on two teams
   * produces (the seed fixture has one), so the apply step must skip the join.
   */
  alreadyOnTarget?: boolean
}

export interface NewTeam {
  projectId: string
  projectTitle: string
  name: string
}

export interface ImportCounts {
  total: number
  errors: number
  assign: number
  create: number
  unassign: number
  unchanged: number
  /** Rows that change something — the number the Apply button quotes. */
  changes: number
}

export interface ImportPlan {
  rows: PlannedRow[]
  /** Teams to create, one entry per distinct (project, name). */
  creates: NewTeam[]
  counts: ImportCounts
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Column aliases. Excel and a human both drift from the exact header, and a
 * header that "looks right" but is rejected reads as a broken feature, so a
 * small, explicit set of spellings is accepted.
 */
const COLUMN_ALIASES: Record<string, (typeof IMPORT_COLUMNS)[number]> = {
  user_email: "user_email",
  email: "user_email",
  useremail: "user_email",
  user: "user_email",
  project: "project",
  project_title: "project",
  projecttitle: "project",
  team: "team",
  team_name: "team",
  teamname: "team",
}

/** lowercase, trim, and collapse anything that is not a letter or digit to `_`. */
function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/**
 * Which delimiter this file uses, sniffed from the header line.
 *
 * Excel writes `;` wherever the OS list separator is `;` (most of continental
 * Europe) — a file that looks perfect in Excel and parses as ONE column
 * everywhere else. Guessing here is far cheaper than the support question.
 */
function sniffDelimiter(text: string): string {
  const header = text.split(/\r?\n/, 1)[0] ?? ""
  const counts: [string, number][] = [
    [",", (header.match(/,/g) ?? []).length],
    [";", (header.match(/;/g) ?? []).length],
    ["\t", (header.match(/\t/g) ?? []).length],
  ]
  counts.sort((a, b) => b[1] - a[1])

  return counts[0]![1] > 0 ? counts[0]![0] : ","
}

/** RFC 4180 record split: quoted fields may contain the delimiter and newlines. */
function splitCsv(text: string, delimiter: string): string[][] {
  const records: string[][] = []
  let field = ""
  let record: string[] = []
  let quoted = false
  let i = 0

  const endField = () => {
    record.push(field)
    field = ""
  }
  const endRecord = () => {
    endField()
    records.push(record)
    record = []
  }

  while (i < text.length) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      field += c
      i += 1
      continue
    }
    if (c === '"') {
      quoted = true
      i += 1
      continue
    }
    if (c === delimiter) {
      endField()
      i += 1
      continue
    }
    if (c === "\r") {
      // Bare \r is a Mac-classic line end; \r\n is one break, not two.
      if (text[i + 1] === "\n") i += 1
      endRecord()
      i += 1
      continue
    }
    if (c === "\n") {
      endRecord()
      i += 1
      continue
    }
    field += c
    i += 1
  }
  if (field !== "" || record.length > 0) endRecord()

  return records
}

function isBlankRecord(r: string[]): boolean {
  return r.every((c) => c.trim() === "")
}

function missingColumnsMessage(missing: string[]): string {
  const wanted = IMPORT_COLUMNS.map((c) => `"${c}"`).join(", ")
  if (missing.length === IMPORT_COLUMNS.length) {
    return `the header row has none of the columns ${wanted}`
  }

  return `the file is missing the ${missing.length === 1 ? "column" : "columns"} ${missing
    .map((m) => `"${m}"`)
    .join(", ")} — it needs ${wanted}`
}

function parseCsv(text: string): ParseResult {
  const records = splitCsv(text, sniffDelimiter(text)).filter(
    (r) => !isBlankRecord(r),
  )
  if (records.length === 0) return { ok: false, message: "the file is empty" }

  const header = records[0]!.map(normalizeKey)
  const index: Partial<Record<(typeof IMPORT_COLUMNS)[number], number>> = {}
  header.forEach((h, i) => {
    const col = COLUMN_ALIASES[h]
    // First occurrence wins, so a duplicated column cannot shadow the real one.
    if (col && index[col] === undefined) index[col] = i
  })

  const missing = IMPORT_COLUMNS.filter((c) => index[c] === undefined)
  if (missing.length > 0) {
    return { ok: false, message: missingColumnsMessage([...missing]) }
  }

  const body = records.slice(1)
  if (body.length === 0) {
    return {
      ok: false,
      message: "the file has a header but no rows",
    }
  }
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      message: `the file has ${body.length} rows, more than the ${MAX_IMPORT_ROWS} this import accepts`,
    }
  }

  const at = (r: string[], col: (typeof IMPORT_COLUMNS)[number]) =>
    (r[index[col]!] ?? "").trim()

  return {
    ok: true,
    format: "csv",
    rows: body.map((r, n) => ({
      row: n + 1,
      userEmail: at(r, "user_email"),
      project: at(r, "project"),
      team: at(r, "team"),
    })),
  }
}

function parseJson(text: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return {
      ok: false,
      message: `the file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  // Accept both the bare array the template writes and a `{ rows: [...] }`
  // wrapper, which is what anyone hand-rolling an export tends to produce.
  const list =
    Array.isArray(parsed) ? parsed
    : (
      parsed !== null &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { rows?: unknown }).rows)
    ) ?
      ((parsed as { rows: unknown[] }).rows as unknown[])
    : null
  if (!list) {
    return {
      ok: false,
      message: 'the JSON must be an array of rows, or an object with a "rows" array',
    }
  }
  if (list.length === 0) return { ok: false, message: "the file has no rows" }
  if (list.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      message: `the file has ${list.length} rows, more than the ${MAX_IMPORT_ROWS} this import accepts`,
    }
  }

  const rows: RosterRow[] = []
  for (const [n, entry] of list.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, message: `row ${n + 1} is not an object` }
    }
    const byCol: Partial<Record<(typeof IMPORT_COLUMNS)[number], string>> = {}
    for (const [rawKey, rawValue] of Object.entries(entry)) {
      const col = COLUMN_ALIASES[normalizeKey(rawKey)]
      if (!col || byCol[col] !== undefined) continue
      if (rawValue === null || rawValue === undefined) {
        byCol[col] = ""
        continue
      }
      if (typeof rawValue === "object") {
        return {
          ok: false,
          message: `row ${n + 1}: "${rawKey}" must be text, not ${
            Array.isArray(rawValue) ? "a list" : "an object"
          }`,
        }
      }
      byCol[col] = String(rawValue).trim()
    }
    const missing = IMPORT_COLUMNS.filter((c) => byCol[c] === undefined)
    // Only user_email is structurally required in JSON: an object may simply
    // omit a key it has nothing to say about, which is the natural way to write
    // "take this person off their team".
    if (missing.includes("user_email")) {
      return { ok: false, message: missingColumnsMessage(["user_email"]) }
    }
    rows.push({
      row: n + 1,
      userEmail: byCol.user_email ?? "",
      project: byCol.project ?? "",
      team: byCol.team ?? "",
    })
  }

  return { ok: true, format: "json", rows }
}

/**
 * Split an uploaded file into rows, or say why it cannot be read.
 *
 * CONTENT decides the format, not the extension: a CSV's first character has to
 * begin a header cell, so a file opening with `[` or `{` is JSON whatever it is
 * called. Reading a renamed JSON as CSV would answer "the header row has none of
 * the columns", which is a baffling thing to be told about a perfectly good
 * file. The `.json` extension is still honoured for the reverse case — JSON that
 * somehow does not start with a bracket.
 */
export function parseRosterFile(text: string, filename = ""): ParseResult {
  // Excel prefixes a UTF-8 BOM, which would otherwise make the first header
  // cell "\uFEFFuser_email" and lose the email column of every file it writes.
  const body = text.replace(/^\uFEFF/, "")
  if (body.trim() === "") return { ok: false, message: "the file is empty" }

  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  const isJson = /^[[{]/.test(body.trim()) || ext === "json"

  return isJson ? parseJson(body) : parseCsv(body)
}

// ─── Resolution ──────────────────────────────────────────────────────────────

const fold = (s: string) => s.trim().toLowerCase()

/** `[a, b]` → `"a" and "b"` — team names in a sentence an organiser reads. */
function quoteList(names: string[]): string {
  const quoted = names.map((n) => `"${n}"`)
  if (quoted.length <= 1) return quoted.join("")
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`
}

/**
 * Turn parsed rows into exactly what will happen, row by row, without writing
 * anything.
 */
export function resolveImport(
  rows: readonly RosterRow[],
  world: ImportWorld,
): ImportPlan {
  const byEmail = new Map<string, ImportParticipant>()
  for (const p of world.participants) {
    if (p.email.trim() !== "") byEmail.set(fold(p.email), p)
  }

  const teamsByUser = new Map<string, ImportTeam[]>()
  for (const t of world.teams) {
    for (const id of t.memberIds) {
      const list = teamsByUser.get(id) ?? []
      list.push(t)
      teamsByUser.set(id, list)
    }
  }
  // How many rows name each email. A person belongs to at most one team, so two
  // rows for one person have no defensible resolution: "last one wins" would
  // silently pick for them.
  const emailCount = new Map<string, number>()
  for (const r of rows) {
    const key = fold(r.userEmail)
    if (key !== "") emailCount.set(key, (emailCount.get(key) ?? 0) + 1)
  }

  const creates: NewTeam[] = []
  const createIndex = new Map<string, number>()
  const planned: PlannedRow[] = []

  for (const r of rows) {
    const email = r.userEmail.trim()
    const projectName = r.project.trim()
    const teamName = r.team.trim()
    const base = {
      row: r.row,
      email,
      name: "",
      project: projectName,
      team: teamName,
    }
    const err = (detail: string): PlannedRow => ({
      ...base,
      status: "error",
      detail,
    })

    if (email === "") {
      planned.push(err("user_email is empty — every row must name a participant"))
      continue
    }
    const key = fold(email)
    const seen = emailCount.get(key) ?? 0
    if (seen > 1) {
      planned.push(
        err(
          `${email} appears on ${seen} rows — a participant belongs to at most one team`,
        ),
      )
      continue
    }
    const person = byEmail.get(key)
    if (!person) {
      planned.push(
        err(`no participant of this hackathon has the email "${email}"`),
      )
      continue
    }
    base.name = person.name
    if (person.isWaiting) {
      planned.push(
        err(
          `${email} is on the waiting list — approve them before putting them on a team`,
        ),
      )
      continue
    }

    const current = teamsByUser.get(person.id) ?? []
    const currentNames = current.map((t) => t.name)

    if (projectName === "" && teamName === "") {
      if (current.length === 0) {
        planned.push({
          ...base,
          status: "unchanged",
          detail: "on no team, and this row leaves it that way",
          userId: person.id,
        })
        continue
      }
      planned.push({
        ...base,
        status: "unassign",
        detail: `leaves ${quoteList(currentNames)}`,
        userId: person.id,
        target: null,
        leave: current.map((t) => t.id),
      })
      continue
    }
    if (projectName === "") {
      planned.push(
        err(
          `the team "${teamName}" needs a project — put the project title in the project column`,
        ),
      )
      continue
    }
    if (teamName === "") {
      planned.push(
        err(
          `the project "${projectName}" needs a team name — put it in the team column`,
        ),
      )
      continue
    }
    if (teamName.length > MAX_TEAM_NAME) {
      planned.push(
        err(`the team name is ${teamName.length} characters; the limit is ${MAX_TEAM_NAME}`),
      )
      continue
    }

    const projectMatches = world.projects.filter(
      (p) => fold(p.title) === fold(projectName),
    )
    if (projectMatches.length === 0) {
      planned.push(
        err(`no project of this hackathon is titled "${projectName}"`),
      )
      continue
    }
    if (projectMatches.length > 1) {
      planned.push(
        err(
          `${projectMatches.length} projects are titled "${projectName}" — rename one of them before importing`,
        ),
      )
      continue
    }
    const project = projectMatches[0]!

    const teamMatches = world.teams.filter(
      (t) => t.projectId === project.id && fold(t.name) === fold(teamName),
    )
    if (teamMatches.length > 1) {
      planned.push(
        err(
          `${teamMatches.length} teams under "${project.title}" are named "${teamName}" — rename one of them before importing`,
        ),
      )
      continue
    }

    if (teamMatches.length === 1) {
      const team = teamMatches[0]!
      const leave = current.filter((t) => t.id !== team.id)
      const alreadyThere = current.some((t) => t.id === team.id)
      if (alreadyThere && leave.length === 0) {
        planned.push({
          ...base,
          status: "unchanged",
          detail: `already on "${team.name}"`,
          userId: person.id,
        })
        continue
      }
      planned.push({
        ...base,
        status: "assign",
        detail:
          leave.length === 0 ?
            `joins "${team.name}" (${project.title})`
          : alreadyThere ?
            `stays on "${team.name}" and leaves ${quoteList(leave.map((t) => t.name))}`
          : `moves from ${quoteList(leave.map((t) => t.name))} to "${team.name}"`,
        userId: person.id,
        target: team.id,
        leave: leave.map((t) => t.id),
        alreadyOnTarget: alreadyThere,
      })
      continue
    }

    // No such team under that project yet: create it, once, however many rows
    // name it.
    const createKey = `${project.id} ${fold(teamName)}`
    let at = createIndex.get(createKey)
    if (at === undefined) {
      at = creates.length
      creates.push({
        projectId: project.id,
        projectTitle: project.title,
        name: teamName,
      })
      createIndex.set(createKey, at)
    }
    planned.push({
      ...base,
      status: "create",
      detail:
        current.length === 0 ?
          `joins a new team "${teamName}" under "${project.title}"`
        : `moves from ${quoteList(currentNames)} into a new team "${teamName}" under "${project.title}"`,
      userId: person.id,
      target: `new:${at}`,
      leave: current.map((t) => t.id),
    })
  }

  const count = (s: RowStatus) => planned.filter((p) => p.status === s).length
  const counts: ImportCounts = {
    total: planned.length,
    errors: count("error"),
    assign: count("assign"),
    create: count("create"),
    unassign: count("unassign"),
    unchanged: count("unchanged"),
    changes: 0,
  }
  counts.changes = counts.assign + counts.create + counts.unassign

  return { rows: planned, creates, counts }
}

// ─── The template ────────────────────────────────────────────────────────────

/** "AutoML Pipeline Builder" -> "APB". */
export function initialsOf(text: string): string {
  return (
    text
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  )
}

/** RFC 4180 quoting: a field is safe only once its own quotes are doubled. */
function csvCell(v: string): string {
  return `"${v.replaceAll('"', '""')}"`
}

export interface TemplateRow {
  user_email: string
  project: string
  team: string
}

/**
 * The rows of the template: the CURRENT roster, prefilled with whatever the
 * platform already knows.
 *
 * One row per confirmed participant, with the project and team they are on
 * already filled in and blank columns for the people still unplaced. That makes
 * the file both a worked example (real project and team names, in context — a
 * template with invented project names teaches the wrong values) and a starting
 * point: upload it back unchanged and nothing happens.
 *
 * Ordering is assigned-first, then alphabetical, so the filled-in examples are
 * the first thing on screen when the file opens and the blanks to fill are
 * together underneath.
 *
 * Waitlisted participants are left out: they cannot be put on a team until they
 * are approved, so a row for them could only ever be an error.
 *
 * A participant on SEVERAL teams — which the DB permits and the product does not
 * — gets the alphabetically first, so the file states one truth and re-importing
 * it repairs the drift. The alternative (skipping them) would hide it.
 */
export function templateRows(world: ImportWorld): TemplateRow[] {
  const projectById = new Map(world.projects.map((p) => [p.id, p]))
  const teamsByUser = new Map<string, ImportTeam[]>()
  for (const t of world.teams) {
    for (const id of t.memberIds) {
      const list = teamsByUser.get(id) ?? []
      list.push(t)
      teamsByUser.set(id, list)
    }
  }

  const confirmed = world.participants.filter((p) => !p.isWaiting)
  const rows = confirmed.map((p) => {
    const mine = [...(teamsByUser.get(p.id) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    const team = mine[0]
    const project = team ? projectById.get(team.projectId) : undefined

    return {
      user_email: p.email,
      project: project?.title ?? "",
      team: team?.name ?? "",
      _name: p.name || p.email,
      _assigned: team !== undefined,
    }
  })

  rows.sort((a, b) => {
    if (a._assigned !== b._assigned) return a._assigned ? -1 : 1

    return a._name.localeCompare(b._name)
  })

  if (rows.length > 0) {
    return rows.map(({ user_email, project, team }) => ({
      user_email,
      project,
      team,
    }))
  }

  // Nobody confirmed yet, so there is no roster to snapshot. Two example rows
  // then, sharing one team, because "two people on the same team" is the shape
  // the format exists to express. The project title is a REAL one when the event
  // has any; the emails are obviously placeholders, and the importer will say so
  // by name if they are left in.
  const example = world.projects[0]?.title ?? "Project title, exactly as in this event"
  const team = world.projects[0] ? `Team ${initialsOf(example)}` : "Team name"

  return [
    { user_email: "first.participant@example.org", project: example, team },
    { user_email: "second.participant@example.org", project: example, team },
  ]
}

/** The downloadable file, in the format asked for. */
export function buildTemplate(world: ImportWorld, format: ImportFormat): string {
  const rows = templateRows(world)
  if (format === "json") return `${JSON.stringify(rows, null, 2)}\n`

  const lines = [
    IMPORT_COLUMNS.map(csvCell).join(","),
    ...rows.map((r) => [r.user_email, r.project, r.team].map(csvCell).join(",")),
  ]

  // CRLF, which is what RFC 4180 specifies and what Excel expects.
  return `${lines.join("\r\n")}\r\n`
}
