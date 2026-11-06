import { csvRow } from "./csv"
import { PROFILE_LINK_KINDS, type ProfileLinks } from "./profileLinks"

/**
 * The participant roster file, for import into a mailing tool.
 *
 * Write-only, unlike the team assignment: nothing reads it back. Headed in
 * words a mailing tool's importer matches to its own fields — `Email Address`,
 * `Full Name` — rather than the lower-case column names of the team file, which
 * are spelled for being read back in.
 */

/** One participant, as a row. */
export interface RosterRow {
  email: string
  name: string
  status: "Approved" | "Waitlisted"
  role: "Owner" | "Member"
  /** Their profile links; an empty string for each one not set. */
  links: ProfileLinks
  /** Their answer, by question key. A question they skipped is absent. */
  answers: Record<string, string>
}

/**
 * The file as it goes out: who, where they stand, the profiles they link to —
 * one column per site, in the order the Account page lists them — and then one
 * column per registration question, headed by its label.
 */
export function rosterCsv(
  rows: readonly RosterRow[],
  questions: readonly { key: string; label: string }[],
): string {
  const header = [
    "Email Address",
    "Full Name",
    "Status",
    "Role",
    ...PROFILE_LINK_KINDS.map((k) => k.label),
    ...questions.map((q) => q.label),
  ]

  return (
    csvRow(header) +
    rows
      .map((r) =>
        csvRow([
          r.email,
          r.name,
          r.status,
          r.role,
          ...PROFILE_LINK_KINDS.map((k) => r.links[k.key]),
          ...questions.map((q) => r.answers[q.key] ?? ""),
        ]),
      )
      .join("")
  )
}
