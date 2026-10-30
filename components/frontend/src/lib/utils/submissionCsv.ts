import { csvRow } from "./csv"

/**
 * Manage Submissions as a CSV, for checking entries off away from the screen.
 *
 * Write-only, like `projectCsv`. Its own module so the column order and the
 * date format are pinned down in a test rather than inline in the route.
 */

/** One team, as a row. Every field is already the text the cell shows. */
export interface SubmissionCsvRow {
  team: string
  project: string
  /** Current members by name, already sorted. */
  members: string[]
  /** "No submission", "Draft only" or "Final" — as the page's tabs say it. */
  standing: string
  /** The version that counts: the final entry if there is one. */
  version: number | undefined
  submittedAt: Date | undefined
  submittedBy: string | undefined
  finalizedAt: Date | undefined
  finalizedBy: string | undefined
  /** A draft newer than the final entry, which does not count unless finalized. */
  newerDraft: number | undefined
  repositoryUrl: string | undefined
}

/**
 * A time as a spreadsheet reads it: `2026-08-01 10:00`, in UTC.
 *
 * UTC because the file is built on the server, which knows nothing of the
 * reader's time zone — the header says so rather than leaving a local-looking
 * time to be misread. Without seconds or a `T`, which is the shape every
 * spreadsheet parses as a date on its own.
 */
export function sheetTime(d: Date | undefined): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : ""
}

/**
 * The file as it goes out.
 *
 * `Result` last, because it is the one column that may hold a paragraph of
 * notes rather than a link, and anything after it would sit beyond a tall cell.
 */
export function submissionCsv(rows: readonly SubmissionCsvRow[]): string {
  const num = (n: number | undefined) => (n === undefined ? "" : String(n))

  return (
    csvRow([
      "Team",
      "Project",
      "Members",
      "Standing",
      "Version",
      "Submitted (UTC)",
      "Submitted By",
      "Finalized (UTC)",
      "Finalized By",
      "Newer Draft",
      "Result",
    ]) +
    rows
      .map((r) =>
        csvRow([
          r.team,
          r.project,
          r.members.join(", "),
          r.standing,
          num(r.version),
          sheetTime(r.submittedAt),
          r.submittedBy ?? "",
          sheetTime(r.finalizedAt),
          r.finalizedBy ?? "",
          num(r.newerDraft),
          r.repositoryUrl ?? "",
        ]),
      )
      .join("")
  )
}
