/**
 * The text transforms behind the markdown toolbar.
 *
 * Each one takes the textarea's value plus its selection and returns the same
 * shape. Nothing in here touches the DOM — the component reads the selection,
 * calls a transform, and writes the result back — which is what makes the
 * fiddly part (where the caret lands afterwards) testable.
 */

export interface Edit {
  value: string
  /** Selection start, or the caret when it equals `end`. */
  start: number
  end: number
}

const BULLET = /^[-*+] /
const ORDERED = /^\d+[.)] /
const HEADING = /^#{1,6} /

/** A whole list item's leader: indent, marker, spacing, optional checkbox. */
const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(\[[ xX]\] )?/
const QUOTE_LINE = /^\s*>\s?/

/** Anything that should land in the `(…)` half of a link rather than the `[…]`
 *  half — a pasted address, or a path into this app. */
const URL_LIKE = /^(https?:\/\/|mailto:|\/)\S*$/i

const startOfLine = (value: string, index: number) =>
  value.lastIndexOf("\n", index - 1) + 1

const endOfLine = (value: string, index: number) => {
  const next = value.indexOf("\n", index)
  return next === -1 ? value.length : next
}

/** A rewritten line, split at the point where it changed. */
interface Line {
  /** The marker this line should now carry: `- `, `3. `, `## `, or nothing. */
  leader: string
  /** Everything after it, with any previous marker already taken off. */
  body: string
}

/**
 * Rewrites every line the selection touches.
 *
 * Splitting each result into leader and body is what lets the caret be placed
 * exactly. A caret that sat inside the old marker belongs straight after the
 * new one; anywhere else it shifts by the difference between them. Moving it by
 * the raw change in line length instead lands it *inside* `1.` when a bullet
 * becomes a number — and parking it around the whole block would mean the `- `
 * the button just wrote is selected, so the next keystroke deletes it.
 */
function replaceBlock(edit: Edit, rewrite: (lines: string[]) => Line[]): Edit {
  const { value, start, end } = edit
  const from = startOfLine(value, start)
  const to = endOfLine(value, end)

  const lines = value.slice(from, to).split("\n")
  const next = rewrite(lines)
  const block = lines.join("\n")
  const nextBlock = next.map(({ leader, body }) => leader + body).join("\n")

  // `split` always yields at least one entry and `rewrite` maps over them, so
  // both of these exist; the defaults are only here to satisfy
  // `noUncheckedIndexedAccess`.
  const [first = ""] = lines
  const [head = { leader: "", body: "" }] = next

  const oldLeader = first.length - head.body.length
  const newLeader = head.leader.length
  const offset = start - from
  const caret =
    from + (offset <= oldLeader ? newLeader : offset + newLeader - oldLeader)

  return {
    value: value.slice(0, from) + nextBlock + value.slice(to),
    start: caret,
    end: Math.max(caret, end + (nextBlock.length - block.length)),
  }
}

/**
 * Wraps the selection in `marker`, or unwraps it if it is already wrapped —
 * checking both inside the selection (`**bold**` selected) and just outside it
 * (`bold` selected within `**bold**`), because which one the user has depends
 * on whether they double-clicked the word or dragged across the markers.
 *
 * With nothing selected it drops in `placeholder` and selects that, so the
 * button is useful before you have typed anything.
 */
export function toggleWrap(
  edit: Edit,
  marker: string,
  placeholder: string,
): Edit {
  const { value, start, end } = edit
  const selected = value.slice(start, end)
  const width = marker.length

  if (
    selected.length >= width * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(width, selected.length - width)
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      start,
      end: start + inner.length,
    }
  }

  if (
    start >= width &&
    value.slice(start - width, start) === marker &&
    value.slice(end, end + width) === marker
  ) {
    return {
      value:
        value.slice(0, start - width) + selected + value.slice(end + width),
      start: start - width,
      end: end - width,
    }
  }

  const body = selected || placeholder
  return {
    value: value.slice(0, start) + marker + body + marker + value.slice(end),
    start: start + width,
    end: start + width + body.length,
  }
}

export const toggleBold = (edit: Edit): Edit =>
  toggleWrap(edit, "**", "bold text")

/** `_` rather than `*` for emphasis: `*` inside `**bold**` is ambiguous both to
 *  the parser and to the unwrap check above. */
export const toggleItalic = (edit: Edit): Edit =>
  toggleWrap(edit, "_", "italic text")

/**
 * Inline backticks for a phrase; a fenced block the moment the selection spans
 * lines, since several lines in single backticks render as one run-on line,
 * which is never what was meant.
 */
export function toggleCode(edit: Edit): Edit {
  const { value, start, end } = edit
  if (!value.slice(start, end).includes("\n"))
    return toggleWrap(edit, "`", "code")

  const from = startOfLine(value, start)
  const to = endOfLine(value, end)
  const block = value.slice(from, to)

  return {
    value: value.slice(0, from) + "```\n" + block + "\n```" + value.slice(to),
    start: from + 4,
    end: from + 4 + block.length,
  }
}

/** Bullets and numbers swap rather than stack — a line is one or the other. */
export function toggleBulletList(edit: Edit): Edit {
  return replaceBlock(edit, (lines) =>
    lines.every((line) => BULLET.test(line))
      ? lines.map((line) => ({ leader: "", body: line.replace(BULLET, "") }))
      : lines.map((line) => ({
          leader: "- ",
          body: line.replace(ORDERED, ""),
        })),
  )
}

export function toggleOrderedList(edit: Edit): Edit {
  return replaceBlock(edit, (lines) =>
    lines.every((line) => ORDERED.test(line))
      ? lines.map((line) => ({ leader: "", body: line.replace(ORDERED, "") }))
      : lines.map((line, i) => ({
          leader: `${i + 1}. `,
          body: line.replace(BULLET, ""),
        })),
  )
}

export function toggleQuote(edit: Edit): Edit {
  return replaceBlock(edit, (lines) =>
    lines.every((line) => line.startsWith("> "))
      ? lines.map((line) => ({ leader: "", body: line.slice(2) }))
      : lines.map((line) => ({ leader: "> ", body: line })),
  )
}

/**
 * `## ` → `### ` → plain, driven off the first line of the selection.
 *
 * Two levels is all a description needs, and cycling one button reaches them
 * without a level dropdown nobody would think to open. `#` is skipped: the page
 * already owns its `h1`.
 */
export function cycleHeading(edit: Edit): Edit {
  return replaceBlock(edit, (lines) => {
    const current = lines[0]?.match(HEADING)?.[0].trimEnd().length ?? 0
    const level = current === 0 ? 2 : current === 2 ? 3 : 0
    const leader = level === 0 ? "" : "#".repeat(level) + " "
    return lines.map((line) => ({ leader, body: line.replace(HEADING, "") }))
  })
}

/**
 * Builds a link and selects whichever half the user still has to fill in — the
 * address when they had words selected, the words when they had pasted an
 * address. Getting this the wrong way round means retyping what you just had.
 */
export function insertLink(edit: Edit): Edit {
  const { value, start, end } = edit
  const selected = value.slice(start, end)
  const pastedUrl = URL_LIKE.test(selected)
  const needsText = pastedUrl || !selected

  const text = needsText ? "link text" : selected
  const href = pastedUrl ? selected : "https://"

  const from = needsText ? start + 1 : start + text.length + 3
  const length = needsText ? text.length : href.length

  return {
    value: value.slice(0, start) + `[${text}](${href})` + value.slice(end),
    start: from,
    end: from + length,
  }
}

/**
 * Enter inside a list continues it; Enter on an item that is still empty ends
 * it. This is what every chat box does, and it is the single thing that stops a
 * first-time author's list turning back into a paragraph on line two.
 *
 * Returns `null` when the caret is not in a list or quote, meaning the caller
 * should let the keystroke through untouched.
 */
export function continueList(edit: Edit): Edit | null {
  const { value, start, end } = edit
  if (start !== end) return null

  const from = startOfLine(value, start)
  const line = value.slice(from, endOfLine(value, start))

  const item = LIST_ITEM.exec(line)
  const quote = item ? null : QUOTE_LINE.exec(line)
  const leader = item?.[0] ?? quote?.[0]
  if (leader === undefined) return null

  // An empty item means "I'm done": clear the leader rather than laying down
  // another one, so a second Enter leaves the list.
  if (line.slice(leader.length).trim() === "") {
    const indent = item?.[1] ?? ""
    return {
      value: value.slice(0, from) + indent + value.slice(from + line.length),
      start: from + indent.length,
      end: from + indent.length,
    }
  }

  const marker = item
    ? `${item[1]}${item[2] ?? `${Number(item[3]) + 1}${item[4]}`}${item[5]}${item[6] ? "[ ] " : ""}`
    : leader

  const inserted = "\n" + marker
  return {
    value: value.slice(0, start) + inserted + value.slice(start),
    start: start + inserted.length,
    end: start + inserted.length,
  }
}

/**
 * The narrowest span that differs between two versions of the text.
 *
 * The toolbar writes its result back through `insertText` so that the browser's
 * own undo stack survives a toolbar click — but that only holds if it is handed
 * the small edit rather than the whole document.
 */
export function diffRange(
  before: string,
  after: string,
): { from: number; to: number; text: string } {
  const max = Math.min(before.length, after.length)

  let head = 0
  while (head < max && before[head] === after[head]) head++

  let tail = 0
  while (
    tail < max - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  )
    tail++

  return {
    from: head,
    to: before.length - tail,
    text: after.slice(head, after.length - tail),
  }
}
