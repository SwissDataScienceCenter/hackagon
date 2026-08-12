/**
 * The toolbar's text transformations.
 *
 * Every case is written as "text with the selection marked by [brackets]" so
 * the expectation reads as the thing a person would see: what the textarea
 * says afterwards AND what stays selected, because a button that formats the
 * right words and then drops the selection is only half working.
 */

import { describe, expect, it } from "vitest"
import {
  BULLET_LIST,
  HEADING,
  NUMBERED_LIST,
  QUOTE,
  insertBlock,
  insertLink,
  toggleCodeBlock,
  toggleInline,
  toggleLinePrefix,
  type EditState,
} from "./markdownEdit"

/** `"a [bc] d"` -> state with `bc` selected. `|` marks a bare caret. */
function state(marked: string): EditState {
  if (marked.includes("|")) {
    const at = marked.indexOf("|")
    return { text: marked.replace("|", ""), start: at, end: at }
  }
  const start = marked.indexOf("[")
  const end = marked.indexOf("]") - 1
  return { text: marked.replace("[", "").replace("]", ""), start, end }
}

/** Inverse of `state`, so failures print the selection instead of two ints. */
function show(s: EditState): string {
  if (s.start === s.end) {
    return `${s.text.slice(0, s.start)}|${s.text.slice(s.start)}`
  }
  return `${s.text.slice(0, s.start)}[${s.text.slice(s.start, s.end)}]${s.text.slice(s.end)}`
}

describe("toggleInline", () => {
  it("wraps a selection and keeps the words selected, not the markers", () => {
    expect(show(toggleInline(state("say [hello] there"), "**"))).toBe(
      "say **[hello]** there",
    )
  })

  it("opens an empty pair with the caret between them", () => {
    expect(show(toggleInline(state("say |"), "**"))).toBe("say **|**")
  })

  it("unwraps when the markers are inside the selection", () => {
    expect(show(toggleInline(state("say [**hello**] there"), "**"))).toBe(
      "say [hello] there",
    )
  })

  it("unwraps when the markers are just outside the selection", () => {
    expect(show(toggleInline(state("say **[hello]** there"), "**"))).toBe(
      "say [hello] there",
    )
  })

  it("does not let italic vandalise bold", () => {
    // The character either side IS `*`, so a naive already-wrapped test would
    // strip one asterisk per side and silently downgrade bold to italic.
    expect(show(toggleInline(state("say **[hello]** there"), "*"))).toBe(
      "say ***[hello]*** there",
    )
    expect(show(toggleInline(state("say [**hello**] there"), "*"))).toBe(
      "say *[**hello**]* there",
    )
  })

  it("wraps a multi-word, multi-line selection whole", () => {
    expect(show(toggleInline(state("[one\ntwo]"), "`"))).toBe("`[one\ntwo]`")
  })

  it("round-trips: wrapping then pressing again restores the original", () => {
    const before = state("say [hello] there")
    const after = toggleInline(toggleInline(before, "**"), "**")
    expect(after).toEqual(before)
  })
})

describe("toggleLinePrefix", () => {
  it("adds a heading and leaves the caret where typing continues", () => {
    expect(show(toggleLinePrefix(state("Tit|le"), HEADING(2)))).toBe(
      "## Tit|le",
    )
  })

  it("re-levels an existing heading instead of stacking hashes", () => {
    expect(show(toggleLinePrefix(state("### Ti|tle"), HEADING(1)))).toBe(
      "# Ti|tle",
    )
  })

  it("removes the prefix when pressed again", () => {
    expect(show(toggleLinePrefix(state("## Ti|tle"), HEADING(2)))).toBe(
      "Ti|tle",
    )
  })

  it("bullets every line the selection touches", () => {
    expect(show(toggleLinePrefix(state("[one\ntwo\nthree]"), BULLET_LIST))).toBe(
      "[- one\n- two\n- three]",
    )
  })

  it("numbers a list from one, per line", () => {
    expect(
      show(toggleLinePrefix(state("[one\ntwo\nthree]"), NUMBERED_LIST)),
    ).toBe("[1. one\n2. two\n3. three]")
  })

  it("converts a bulleted list into a numbered one", () => {
    expect(show(toggleLinePrefix(state("[- one\n- two]"), NUMBERED_LIST))).toBe(
      "[1. one\n2. two]",
    )
  })

  it("levels a mixed selection up rather than half-toggling it", () => {
    // Only the first line is already a quote; the press should quote the rest,
    // not unquote the one that is.
    expect(show(toggleLinePrefix(state("[> one\ntwo]"), QUOTE))).toBe(
      "[> one\n> two]",
    )
  })

  it("removes the prefix only when every touched line has it", () => {
    expect(show(toggleLinePrefix(state("[> one\n> two]"), QUOTE))).toBe(
      "[one\ntwo]",
    )
  })

  it("leaves the rest of the document alone", () => {
    const s = state("intro\n\nTit|le\n\noutro")
    expect(show(toggleLinePrefix(s, HEADING(3)))).toBe(
      "intro\n\n### Tit|le\n\noutro",
    )
  })

  it("prefixes an empty line without swallowing the caret", () => {
    expect(show(toggleLinePrefix(state("|"), BULLET_LIST))).toBe("- |")
  })
})

describe("insertLink", () => {
  it("links the selection and selects the URL, which is what is missing", () => {
    expect(show(insertLink(state("see the [docs] here")))).toBe(
      "see the [docs]([url]) here",
    )
  })

  it("selects the label when the selection is already a URL", () => {
    expect(show(insertLink(state("[https://example.com]")))).toBe(
      "[[link text]](https://example.com)",
    )
  })

  it("inserts both placeholders at a bare caret, label first", () => {
    expect(show(insertLink(state("see |")))).toBe("see [[link text]](url)")
  })
})

describe("toggleCodeBlock", () => {
  it("fences the selected lines and keeps them selected", () => {
    expect(show(toggleCodeBlock(state("[const x = 1]")))).toBe(
      "```\n[const x = 1]\n```",
    )
  })

  it("unfences an already fenced block", () => {
    const fenced = state("[```\nconst x = 1\n```]")
    expect(show(toggleCodeBlock(fenced))).toBe("[const x = 1]")
  })

  it("opens an empty fence with the caret inside it", () => {
    expect(show(toggleCodeBlock(state("|")))).toBe("```\n|\n```\n")
  })
})

describe("insertBlock", () => {
  const TABLE = "| a |\n| - |"

  it("inserts at the start of an empty document without leading blank lines", () => {
    expect(insertBlock(state("|"), TABLE).text).toBe(`${TABLE}\n`)
  })

  it("separates the block from a paragraph above it", () => {
    // Glued to the paragraph, markdown reads the table as more paragraph.
    expect(insertBlock(state("intro|"), TABLE).text).toBe(
      `intro\n\n${TABLE}\n`,
    )
  })

  it("does not add a blank line that is already there", () => {
    expect(insertBlock(state("intro\n\n|"), TABLE).text).toBe(
      `intro\n\n${TABLE}\n`,
    )
  })

  it("separates the block from what follows it", () => {
    expect(insertBlock(state("|outro"), TABLE).text).toBe(
      `${TABLE}\n\noutro`,
    )
  })

  it("leaves the caret after the block", () => {
    const got = insertBlock(state("intro|"), TABLE)
    expect(got.start).toBe(got.end)
    expect(got.text.slice(0, got.start)).toBe(`intro\n\n${TABLE}\n`)
  })

  it("replaces the selection rather than keeping it", () => {
    expect(insertBlock(state("[gone]"), TABLE).text).toBe(`${TABLE}\n`)
  })
})
