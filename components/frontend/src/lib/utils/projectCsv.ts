import { csvRow } from "./csv"

/**
 * The project list as a CSV, for reading the proposals away from the screen.
 *
 * Write-only, unlike `teamAssignmentCsv` — nothing comes back in. It exists as
 * its own module rather than inline in the route because two things here are
 * worth pinning down in a test: the column order, since `Description` holds
 * whole paragraphs and has to stay last, and what happens to the markdown those
 * paragraphs are written in.
 */

/** One proposal, as a row. */
export interface ProjectCsvRow {
  title: string
  /** Who proposed it. Empty when that person has since left the hackathon. */
  creator: string
  /** `Proposed`, `Approved` or `Rejected` — spelled out, never a number. */
  status: string
  /** The proposal in full, as the markdown it was written in. */
  description: string
}

/**
 * What is held back from the marker-stripping below, and put back afterwards.
 *
 * A url is the reason this exists: `https://x.y/a_b_c` run past the emphasis
 * rules comes out as `https://x.y/abc`, having lost the underscores to an
 * italic that was never there. Escaped punctuation and the inside of a code
 * span are held for the same reason — they are text that happens to look like
 * syntax.
 */
interface Held {
  values: string[]
}

const hold = (held: Held, value: string): string =>
  `\ue000${held.values.push(value) - 1}\ue000`

const release = (held: Held, text: string): string =>
  text.replace(/\ue000(\d+)\ue000/g, (_, i) => held.values[Number(i)] ?? "")

/** `[the docs](https://x.y)` -> `the docs (https://x.y)`. */
const withUrl = (held: Held, label: string, url: string): string => {
  const target = url.trim()
  const text = label.trim()
  if (target === "") return text
  if (text === "" || text === target) return hold(held, target)

  return `${text} (${hold(held, target)})`
}

/** Everything that is a marker rather than a word, within one line. */
function inlineText(held: Held, line: string): string {
  return (
    line
      // Escapes first, so `\*not bold\*` keeps its asterisks and is not read as
      // an emphasis by the rules below.
      .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_, c: string) => hold(held, c))
      // A code span is quoted text: whatever is inside it is not markdown.
      .replace(/(`+)([^`]*)\1/g, (_, __, code: string) => hold(held, code))
      // `!` and no `!` land in the same place — an image's alt text reads as
      // the label, which is what it is for.
      .replace(
        /!?\[([^\]]*)\]\(\s*<?([^)>\s]*)>?(?:\s+"[^"]*")?\s*\)/g,
        (_, label: string, url: string) => withUrl(held, label, url),
      )
      .replace(/<((?:https?|mailto):[^>\s]+)>/gi, (_, url: string) =>
        hold(held, url),
      )
      // A url somebody just typed into a sentence, held on the same terms as
      // one that arrived inside a link.
      .replace(/https?:\/\/\S+/g, (url: string) => hold(held, url))
      .replace(/(\*\*\*|___)(.+?)\1/g, "$2")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(\*|_)(.+?)\1/g, "$2")
      .replace(/~~(.+?)~~/g, "$1")
  )
}

/**
 * Markdown as a spreadsheet cell can read it.
 *
 * A CSV has no formatting layer at all, so `**bold**` reaches the sheet with
 * its asterisks showing. This takes the markers off and leaves the words —
 * while keeping **every line break**, because a newline inside a quoted field
 * is real CSV and every spreadsheet renders it as a multi-line cell. Paragraphs
 * and bullets keep their shape; only the syntax goes.
 *
 * Not `markdownToPlainText` from `$lib/utils/markdown`, which is built for a
 * one-line list excerpt: it collapses all whitespace into single spaces and
 * throws link targets away, so a whole proposal would arrive as one unbroken
 * line with every url gone. This works on the source instead of on rendered
 * html, which is what keeps `1.` numbering and list markers exactly as the
 * proposer typed them.
 *
 * Deliberately **not a markdown parser**. The worst case is a stray marker
 * surviving into a cell, which is what every cell looked like before this
 * existed — no failure mode here is worse than the status quo it replaces.
 */
export function markdownToSheetText(md: string): string {
  // A private-use code point stands in for a held value, and any the
  // description already contains are dropped so they cannot be mistaken for
  // one. Every marker is restored below, so none of this reaches the file.
  const held: Held = { values: [] }
  const lines = md.replaceAll("\ue000", "").replace(/\r\n?/g, "\n").split("\n")

  const out: string[] = []
  let fenced = false
  for (const raw of lines) {
    const line = raw.trimEnd()

    // A fenced block is code: the fence goes, the code inside it stays exactly
    // as written, markers and all.
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) {
      out.push(line)
      continue
    }

    // A rule and a setext underline are both drawn with characters that mean
    // nothing once there is nothing to draw with. They become the paragraph
    // break they already were.
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line) || /^\s*=+\s*$/.test(line)) {
      out.push("")
      continue
    }

    const block = line
      .replace(/^\s*#{1,6}\s+/, "")
      .replace(/^\s*>\s?/, "")
      // `*` and `+` bullets become `-`, so one file does not show three
      // spellings of the same list. The emphasis rules would eat a `*` bullet
      // anyway; this is what gives it back as a bullet.
      .replace(/^(\s*)[*+](\s+)/, "$1-$2")

    out.push(inlineText(held, block))
  }

  return release(
    held,
    out
      .join("\n")
      .replace(/[ \t]+$/gm, "")
      // Three blank lines in the source are one paragraph break in a cell.
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  )
}

/**
 * The file as it goes out.
 *
 * `Description` last, because it is the only column holding more than a few
 * words: a spreadsheet shows it as one tall cell, and anything placed after it
 * would sit off to the right of a paragraph nobody has scrolled past.
 *
 * The markdown is flattened on the way out (see `markdownToSheetText`) — a
 * sheet renders none of it, so the markers would be noise in the one column
 * that is meant to be read.
 */
export function projectCsv(rows: readonly ProjectCsvRow[]): string {
  return (
    csvRow(["Project", "Proposed By", "Status", "Description"]) +
    rows
      .map((r) =>
        csvRow([
          r.title,
          r.creator,
          r.status,
          markdownToSheetText(r.description),
        ]),
      )
      .join("")
  )
}
