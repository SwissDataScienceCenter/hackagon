/**
 * Turn pasted tabular data into a GFM markdown table.
 *
 * The realistic input is a spreadsheet selection, which arrives on the
 * clipboard as TAB-separated text — not CSV. Files people export and paste are
 * comma- or semicolon-separated (Excel writes `;` under a locale whose decimal
 * separator is `,`). So the delimiter is sniffed rather than assumed, and when
 * two delimiters both explain the data the caller is told it is ambiguous so a
 * human can pick.
 *
 * Everything here is a pure string transformation, which is why it lives in its
 * own module: the interesting cases are quoted fields, embedded delimiters,
 * ragged rows and cells containing a literal `|` — all of which are cheap to
 * pin down in unit tests and expensive to discover from the UI.
 */

/** Delimiters we sniff for, in preference order for ties. */
export const DELIMITERS = ["\t", ",", ";", "|"] as const
export type Delimiter = (typeof DELIMITERS)[number]

export const DELIMITER_LABELS: Record<Delimiter, string> = {
  "\t": "Tab",
  ",": "Comma",
  ";": "Semicolon",
  "|": "Pipe",
}

/**
 * Split delimited text into rows of fields, RFC 4180 style.
 *
 * Quoting follows what spreadsheets actually emit: a double quote is special
 * only at the START of a field, `""` inside a quoted field is one literal
 * quote, and a quoted field may span newlines (a multi-line cell). A quote in
 * the middle of an unquoted field is data — `5" pipe` is not a parse error.
 *
 * `\r\n` and lone `\r` both end a row, so text copied on any platform parses.
 * Rows in which every field is blank are dropped: a blank line between pasted
 * blocks is noise, not an empty table row.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let fieldStart = true

  const endField = () => {
    row.push(field)
    field = ""
    fieldStart = true
  }
  const endRow = () => {
    endField()
    if (row.some((cell) => cell.trim() !== "")) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"' && fieldStart) {
      inQuotes = true
      fieldStart = false
      continue
    }

    if (ch === delimiter) {
      endField()
      continue
    }

    if (ch === "\r") {
      if (text[i + 1] === "\n") i++
      endRow()
      continue
    }

    if (ch === "\n") {
      endRow()
      continue
    }

    field += ch
    fieldStart = false
  }

  // Whatever is buffered when the text runs out is a final row, unless the
  // text ended on a newline (in which case the buffer is empty and endRow's
  // all-blank check drops it).
  if (field !== "" || row.length > 0) endRow()

  return rows
}

export interface SniffResult {
  /** Best guess. Falls back to tab when nothing splits the text at all. */
  delimiter: Delimiter
  /** True when more than one delimiter explains the data equally well. */
  ambiguous: boolean
  /** Every delimiter that produced a consistent multi-column parse. */
  candidates: Delimiter[]
}

/**
 * Guess which delimiter the pasted text uses.
 *
 * A candidate qualifies when the most common field count it produces is at
 * least two — one column is not a table — and at least half the rows agree on
 * it. The majority rather than unanimity, because ragged input is normal: a
 * spreadsheet range with one short row must still be recognised as a table.
 *
 * Ranking is agreement first, then the FEWEST columns, then the order in
 * `DELIMITERS`. The delimiter that splits least aggressively is the one more
 * likely to be structural: European CSV (`;` between fields, `,` as the
 * decimal mark) parses consistently either way, and `;` is the answer.
 *
 * **A tab beats everything it ties with, and is never called ambiguous.** You
 * cannot type a tab into a spreadsheet cell, so a tab in pasted text is a cell
 * boundary; commas inside tab-separated cells are ordinary prose and would
 * otherwise raise an ambiguity warning on every normal paste.
 *
 * Nothing qualifying is not an error — a single column is a legitimate (if
 * dull) table — so tab is returned with `candidates` empty.
 */
export function sniffDelimiter(text: string): SniffResult {
  const scored = DELIMITERS.map((delimiter, order) => {
    const rows = parseDelimited(text, delimiter)
    const counts = rows.map((r) => r.length)
    const columns = mode(counts)
    const agreement =
      counts.length === 0
        ? 0
        : counts.filter((c) => c === columns).length / counts.length
    return {
      delimiter,
      order,
      columns,
      agreement,
      qualifies: columns >= 2 && agreement >= 0.5,
    }
  })

  const candidates = scored
    .filter((s) => s.qualifies)
    .sort(
      (a, b) =>
        b.agreement - a.agreement || a.columns - b.columns || a.order - b.order,
    )

  const winner = candidates[0]
  if (!winner) {
    return { delimiter: "\t", ambiguous: false, candidates: [] }
  }

  const best = winner.agreement
  const tab = candidates.find((c) => c.delimiter === "\t")
  const list = candidates.map((c) => c.delimiter)

  if (tab && tab.agreement === best) {
    return { delimiter: "\t", ambiguous: false, candidates: list }
  }

  return {
    delimiter: winner.delimiter,
    ambiguous: candidates.filter((c) => c.agreement === best).length > 1,
    candidates: list,
  }
}

function mode(values: number[]): number {
  const seen = new Map<number, number>()
  let best = 0
  let bestCount = 0
  for (const v of values) {
    const n = (seen.get(v) ?? 0) + 1
    seen.set(v, n)
    if (n > bestCount || (n === bestCount && v > best)) {
      best = v
      bestCount = n
    }
  }
  return best
}

/**
 * Make one cell safe to put between pipes.
 *
 * `|` has to be escaped or it ends the cell and shifts every column after it —
 * the whole table breaks, and it breaks in the middle of the data rather than
 * visibly. The backslash has to be escaped FIRST and for the same reason: a
 * cell reading `a\|b` would otherwise come out as `a\\|b`, which GFM reads as
 * an escaped backslash followed by a live pipe, splitting the cell after all.
 *
 * A newline inside a quoted cell becomes `<br>`, because a markdown table row
 * is one line by definition and there is no escape for a line break inside a
 * cell. `<br>` survives the render pipeline's sanitizer allowlist.
 */
export function escapeCell(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r\n|\r|\n/g, "<br>")
    .trim()
}

export interface TableOptions {
  /** Treat the first row as the header. Off -> an empty header row is emitted. */
  firstRowIsHeader?: boolean
}

/**
 * Render rows as a GFM table: header, alignment separator, body.
 *
 * Cells are padded to the column width. The textarea is the source of truth and
 * stays hand-editable, so the markdown it receives should be readable by the
 * person who has to maintain it.
 *
 * Ragged input is padded, never truncated: the column count is the WIDEST row,
 * so a stray extra field shows up as a column with gaps instead of silently
 * dropping data.
 */
export function toMarkdownTable(
  rows: string[][],
  { firstRowIsHeader = true }: TableOptions = {},
): string {
  if (rows.length === 0) return ""

  const columns = Math.max(...rows.map((r) => r.length))
  const escaped = rows.map((row) =>
    Array.from({ length: columns }, (_, i) => escapeCell(row[i] ?? "")),
  )

  const blank = Array.from({ length: columns }, () => "")
  const header = firstRowIsHeader ? (escaped[0] ?? blank) : blank
  const body = firstRowIsHeader ? escaped.slice(1) : escaped

  const widths = Array.from({ length: columns }, (_, i) =>
    Math.max(
      3,
      (header[i] ?? "").length,
      ...body.map((r) => (r[i] ?? "").length),
    ),
  )

  const line = (cells: string[]) =>
    `| ${cells.map((c, i) => c.padEnd(widths[i] ?? 3)).join(" | ")} |`

  return [
    line(header),
    `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`,
    ...body.map(line),
  ].join("\n")
}

export interface TableFromPaste {
  /** The markdown table, ready to insert. */
  markdown: string
  /** Which delimiter was used. */
  delimiter: Delimiter
  /** True when more than one delimiter explained the input. */
  ambiguous: boolean
  candidates: Delimiter[]
  /** Shape of the result, for a "3 columns x 4 rows" confirmation. */
  columns: number
  /** Body rows, i.e. excluding the header. */
  rows: number
}

/**
 * Parse pasted text and render it as a markdown table in one step.
 *
 * Returns `null` for input with nothing in it, so a caller can keep the button
 * honest instead of inserting an empty table.
 */
export function tableFromPaste(
  text: string,
  options: TableOptions & { delimiter?: Delimiter } = {},
): TableFromPaste | null {
  if (!text.trim()) return null

  const sniffed = sniffDelimiter(text)
  const delimiter = options.delimiter ?? sniffed.delimiter
  const parsed = parseDelimited(text, delimiter)
  if (parsed.length === 0) return null

  const markdown = toMarkdownTable(parsed, options)
  const columns = Math.max(...parsed.map((r) => r.length))
  const header = options.firstRowIsHeader !== false

  return {
    markdown,
    delimiter,
    // Only meaningful when the caller did not choose; an explicit pick is not
    // ambiguous by definition.
    ambiguous: options.delimiter === undefined && sniffed.ambiguous,
    candidates: sniffed.candidates,
    columns,
    rows: header ? parsed.length - 1 : parsed.length,
  }
}
