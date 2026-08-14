/**
 * The text transformations behind MarkdownEditor's formatting toolbar.
 *
 * Every function here is pure: it takes the textarea's whole value plus the
 * current selection and returns the new value plus where the selection should
 * end up. Nothing touches the DOM, so the awkward cases — an empty caret, a
 * selection that already carries its own markers, a multi-line list toggle —
 * are unit-testable without mounting anything.
 *
 * This is deliberately NOT a rich-text model. The textarea stays the single
 * source of truth: these helpers rewrite the same string a person could have
 * typed by hand, so hand-editing and the buttons can never disagree about what
 * the document is.
 */

/** A textarea's value and selection, in and out. */
export interface EditState {
  text: string
  /** Selection anchor (`selectionStart`). */
  start: number
  /** Selection focus (`selectionEnd`); equal to `start` for a bare caret. */
  end: number
}

/** Length of the run of `ch` ending at `index` (exclusive). */
function runBefore(text: string, index: number, ch: string): number {
  let n = 0
  while (index - n - 1 >= 0 && text[index - n - 1] === ch) n++
  return n
}

/** Length of the run of `ch` starting at `index`. */
function runAfter(text: string, index: number, ch: string): number {
  let n = 0
  while (index + n < text.length && text[index + n] === ch) n++
  return n
}

/**
 * Wrap (or unwrap) the selection in an inline marker: `**`, `*`, `` ` ``.
 *
 * Three behaviours, all of which people expect from the same button:
 *
 * - Empty caret -> insert the pair and sit between them, so typing continues
 *   inside the emphasis.
 * - Selection already carrying the markers (either inside the selection or
 *   immediately around it) -> remove them. A toggle, not an accumulator.
 * - Otherwise -> wrap, keeping the selection over the *inner* text so the next
 *   button press applies to the same words rather than to the markers.
 *
 * The run-length check is what stops italic from vandalising bold. In
 * `**hello**` with `hello` selected, the character either side IS `*`, so a
 * naive "is it already wrapped" test would strip one asterisk per side and turn
 * bold into italic. Requiring the run to be exactly as long as the marker means
 * italic-on-bold wraps instead, giving `***hello***`.
 */
export function toggleInline(state: EditState, marker: string): EditState {
  const { text, start, end } = state
  const ch = marker.charAt(0)
  const n = marker.length

  if (start === end) {
    return {
      text: `${text.slice(0, start)}${marker}${marker}${text.slice(start)}`,
      start: start + n,
      end: start + n,
    }
  }

  const selected = text.slice(start, end)

  // Markers inside the selection: `**hello**` selected whole.
  if (
    selected.length >= 2 * n &&
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    runAfter(selected, 0, ch) === n &&
    runBefore(selected, selected.length, ch) === n
  ) {
    const inner = selected.slice(n, selected.length - n)
    return {
      text: `${text.slice(0, start)}${inner}${text.slice(end)}`,
      start,
      end: start + inner.length,
    }
  }

  // Markers just outside the selection: `hello` selected within `**hello**`.
  if (runBefore(text, start, ch) === n && runAfter(text, end, ch) === n) {
    return {
      text: `${text.slice(0, start - n)}${selected}${text.slice(end + n)}`,
      start: start - n,
      end: end - n,
    }
  }

  return {
    text: `${text.slice(0, start)}${marker}${selected}${marker}${text.slice(end)}`,
    start: start + n,
    end: end + n,
  }
}

/**
 * A family of line prefixes that replace one another.
 *
 * `match` is what gets stripped before `prefix` is applied, so pressing
 * "Heading 2" on an `### ` line re-levels it instead of producing `## ### `,
 * and the two list buttons convert between each other.
 */
export interface LinePrefix {
  /** The prefix to apply. A function for prefixes that number themselves. */
  prefix: string | ((indexInBlock: number) => string)
  /** Any prefix in the same family, stripped before applying. */
  match: RegExp
}

export const HEADING = (level: number): LinePrefix => ({
  prefix: `${"#".repeat(level)} `,
  match: /^ {0,3}#{1,6} +/,
})

export const QUOTE: LinePrefix = { prefix: "> ", match: /^ {0,3}> ?/ }

// One family for both list kinds so the buttons convert rather than stack.
const LIST_MATCH = /^ {0,3}(?:[-*+]|\d+[.)]) +/

export const BULLET_LIST: LinePrefix = { prefix: "- ", match: LIST_MATCH }

export const NUMBERED_LIST: LinePrefix = {
  prefix: (i) => `${i + 1}. `,
  match: LIST_MATCH,
}

/** Expand a selection to whole lines. */
function lineBounds(text: string, start: number, end: number) {
  const from = text.lastIndexOf("\n", start - 1) + 1
  const nl = text.indexOf("\n", end)
  const to = nl === -1 ? text.length : nl
  return { from, to }
}

/**
 * Apply, re-level or remove a line prefix across every line the selection
 * touches.
 *
 * Removal happens only when EVERY touched line already carries exactly this
 * prefix — a partial selection gets levelled up rather than half-toggled,
 * which is the behaviour that makes a drag over mixed lines predictable.
 */
export function toggleLinePrefix(state: EditState, op: LinePrefix): EditState {
  const { text, start, end } = state
  const { from, to } = lineBounds(text, start, end)
  const lines = text.slice(from, to).split("\n")

  const wanted = (i: number) =>
    typeof op.prefix === "function" ? op.prefix(i) : op.prefix

  const allPrefixed = lines.every((line, i) => line.startsWith(wanted(i)))

  const next = lines.map((line, i) => {
    if (allPrefixed) return line.slice(wanted(i).length)
    return wanted(i) + line.replace(op.match, "")
  })

  const block = next.join("\n")
  const newText = `${text.slice(0, from)}${block}${text.slice(to)}`

  // A bare caret keeps its place in the line rather than selecting the block:
  // the point of pressing "Heading 2" on an empty line is to keep typing.
  if (start === end) {
    const delta = (next[0] ?? "").length - (lines[0] ?? "").length
    const at = Math.max(from, start + delta)
    return { text: newText, start: at, end: at }
  }

  return { text: newText, start: from, end: from + block.length }
}

const LINK_PLACEHOLDER = "link text"
const URL_PLACEHOLDER = "url"

/** Text that is plainly a URL rather than a label. */
const LOOKS_LIKE_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|\/|www\.)\S*$/i

/**
 * Turn the selection into a link, selecting whichever half still needs typing.
 *
 * Selected a label -> the URL is selected, because that is what you do not have
 * yet. Selected something that is already a URL -> the label is selected
 * instead. Nothing selected -> both placeholders go in and the label is
 * selected first.
 */
export function insertLink(state: EditState): EditState {
  const { text, start, end } = state
  const selected = text.slice(start, end)

  if (selected && LOOKS_LIKE_URL.test(selected.trim())) {
    const url = selected.trim()
    const snippet = `[${LINK_PLACEHOLDER}](${url})`
    return {
      text: `${text.slice(0, start)}${snippet}${text.slice(end)}`,
      start: start + 1,
      end: start + 1 + LINK_PLACEHOLDER.length,
    }
  }

  const label = selected || LINK_PLACEHOLDER
  const snippet = `[${label}](${URL_PLACEHOLDER})`
  const urlAt = start + 1 + label.length + 2

  if (!selected) {
    return {
      text: `${text.slice(0, start)}${snippet}${text.slice(end)}`,
      start: start + 1,
      end: start + 1 + label.length,
    }
  }

  return {
    text: `${text.slice(0, start)}${snippet}${text.slice(end)}`,
    start: urlAt,
    end: urlAt + URL_PLACEHOLDER.length,
  }
}

/**
 * Insert a block (a fenced code block, a table) on its own lines.
 *
 * Markdown needs the blank line: a table or a fence glued to the end of a
 * paragraph is read as more paragraph. This inserts exactly the separation
 * that is missing rather than always adding newlines, so pressing the button
 * on an empty document does not open with two blank lines.
 */
export function insertBlock(state: EditState, block: string): EditState {
  const { text, start, end } = state
  const before = text.slice(0, start)
  const after = text.slice(end)

  // Blank line before, unless we are at the very start or there already is one.
  let lead = ""
  if (before.length > 0) {
    if (!before.endsWith("\n")) lead = "\n\n"
    else if (!before.endsWith("\n\n")) lead = "\n"
  }

  let tail = ""
  if (after.length === 0) tail = "\n"
  else if (!after.startsWith("\n")) tail = "\n\n"
  else if (!after.startsWith("\n\n")) tail = "\n"

  const at = start + lead.length + block.length + tail.length
  return {
    text: `${before}${lead}${block}${tail}${after}`,
    start: at,
    end: at,
  }
}

const FENCE = "```"

/**
 * Wrap the selected lines in a fenced code block, or unwrap an already fenced
 * one. An empty caret opens an empty fence with the caret inside it.
 */
export function toggleCodeBlock(state: EditState): EditState {
  const { text, start, end } = state
  const { from, to } = lineBounds(text, start, end)
  const lines = text.slice(from, to).split("\n")

  if (
    lines.length >= 2 &&
    (lines[0] ?? "").trimEnd().startsWith(FENCE) &&
    (lines[lines.length - 1] ?? "").trim() === FENCE
  ) {
    const inner = lines.slice(1, -1).join("\n")
    return {
      text: `${text.slice(0, from)}${inner}${text.slice(to)}`,
      start: from,
      end: from + inner.length,
    }
  }

  const selected = text.slice(from, to)
  if (!selected) {
    const result = insertBlock(
      { text, start: from, end: to },
      `${FENCE}\n\n${FENCE}`,
    )
    // Caret on the blank line between the fences.
    const inside =
      result.text.indexOf(`${FENCE}\n\n${FENCE}`) + FENCE.length + 1
    return { ...result, start: inside, end: inside }
  }

  const block = `${FENCE}\n${selected}\n${FENCE}`
  const newText = `${text.slice(0, from)}${block}${text.slice(to)}`
  return {
    text: newText,
    start: from + FENCE.length + 1,
    end: from + FENCE.length + 1 + selected.length,
  }
}
