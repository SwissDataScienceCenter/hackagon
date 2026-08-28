/**
 * The app's one CSV dialect, both directions.
 *
 * Two routes hand out a CSV — the participant roster and the team assignments —
 * and one of them takes it back again. Writing and reading against one module
 * is what keeps a file this app produced from being a file this app rejects.
 *
 * Client-safe on purpose: the writing happens in a `+server.ts`, the reading in
 * the browser, off a file the organizer picked.
 */

/** RFC 4180: quote anything holding a delimiter, a quote or a newline. */
export function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value

  return `"${value.replaceAll('"', '""')}"`
}

/**
 * One row, terminated.
 *
 * Values go out exactly as stored — no apostrophe in front of a name starting
 * `=`, `+`, `-` or `@`. That would defuse a spreadsheet's formula evaluation at
 * the cost of corrupting the actual name. UTF-8, and no BOM: a reader that
 * needs one is a reader that also writes one, and `parseCsv` strips it.
 */
export function csvRow(fields: readonly string[]): string {
  return fields.map(csvField).join(",") + "\r\n"
}

/** `AI Hack 2026` + `participants` -> `ai-hack-2026-participants.csv`. */
export function csvFilename(name: string, suffix: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return `${slug === "" ? "hackathon" : slug}-${suffix}.csv`
}

/**
 * Which character separates the fields.
 *
 * We always write commas, but a file that has been through a spreadsheet in a
 * locale where the list separator is a semicolon comes back semicolon-separated
 * — and refusing it would mean refusing the file we handed out, edited exactly
 * as intended. Counted over the first line only, and ties fall to the comma we
 * wrote.
 *
 * Quoted sections are counted too, so a header holding `"a;b",c` sniffs wrong.
 * A header field with a delimiter in it is not a case worth the parser it would
 * take to rule out.
 */
function sniffDelimiter(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? ""
  const count = (c: string) => line.split(c).length - 1

  return count(";") > count(",") ? ";" : count("\t") > count(",") ? "\t" : ","
}

/**
 * A CSV into rows of fields.
 *
 * RFC 4180 with the leniency a file round-tripped through a spreadsheet needs:
 * a leading BOM is dropped, `\r\n` and `\n` both end a row, and the delimiter
 * is sniffed rather than assumed.
 *
 * Wholly empty lines are dropped — they are how somebody spaces a sheet out,
 * and a row of nothing carries no meaning for any caller here. A row with the
 * wrong number of fields is **kept**: the caller reads its columns by name and
 * is better placed to say what a short row means than this is.
 *
 * A quote only opens a field at its start, which is what the RFC says and what
 * makes `5" pipe` come through as itself rather than as an unterminated quote.
 */
export function parseCsv(text: string): string[][] {
  const body = text.startsWith("﻿") ? text.slice(1) : text
  const delimiter = sniffDelimiter(body)

  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  const endField = () => {
    row.push(field)
    field = ""
  }
  const endRow = () => {
    endField()
    if (row.some((f) => f !== "")) rows.push(row)
    row = []
  }

  for (let i = 0; i < body.length; i++) {
    const c = body[i] ?? ""

    if (quoted) {
      if (c === '"') {
        // A doubled quote is a literal one; a lone quote closes the field.
        if (body[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += c
      }
      continue
    }

    if (c === '"' && field === "") quoted = true
    else if (c === delimiter) endField()
    else if (c === "\n") endRow()
    else if (c === "\r") {
      if (body[i + 1] === "\n") i++
      endRow()
    } else field += c
  }

  // Whatever the last line left behind, when the file does not end in a break.
  if (field !== "" || row.length > 0) endRow()

  return rows
}
