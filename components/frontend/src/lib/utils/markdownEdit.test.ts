import { describe, expect, it } from "vitest"

import {
  continueList,
  cycleHeading,
  diffRange,
  insertLink,
  toggleBold,
  toggleBulletList,
  toggleCode,
  toggleItalic,
  toggleOrderedList,
  toggleQuote,
  type Edit,
} from "./markdownEdit"

/*
 * These transforms are almost entirely about where the caret and selection end
 * up, and spelling that out as four numeric offsets per case buries the point
 * under arithmetic. So a case is written as the text itself with `|` marking a
 * caret and `‹…›` marking a selection.
 *
 * Guillemets rather than the obvious brackets: `[x]` and `[text](url)` are
 * markdown these very tests have to produce, and a marker that collides with
 * the syntax under test is a trap waiting for whoever edits this next.
 */
function parse(spec: string): Edit {
  if (spec.includes("‹")) {
    const start = spec.indexOf("‹")
    const end = spec.indexOf("›") - 1
    return { value: spec.replace("‹", "").replace("›", ""), start, end }
  }
  const at = spec.indexOf("|")
  return { value: spec.replace("|", ""), start: at, end: at }
}

const show = ({ value, start, end }: Edit): string =>
  start === end
    ? value.slice(0, start) + "|" + value.slice(start)
    : value.slice(0, start) +
      "‹" +
      value.slice(start, end) +
      "›" +
      value.slice(end)

const run = (fn: (edit: Edit) => Edit | null, spec: string): string | null => {
  const out = fn(parse(spec))
  return out && show(out)
}

describe("toggleBold / toggleItalic", () => {
  it("wraps the selection and keeps it selected", () => {
    expect(run(toggleBold, "make ‹this› loud")).toBe("make **‹this›** loud")
  })

  it("drops in a placeholder when nothing is selected, ready to type over", () => {
    expect(run(toggleBold, "so far |")).toBe("so far **‹bold text›**")
  })

  it("unwraps when the markers are inside the selection", () => {
    expect(run(toggleBold, "make ‹**this**› loud")).toBe("make ‹this› loud")
  })

  it("unwraps when the markers sit just outside the selection", () => {
    expect(run(toggleBold, "make **‹this›** loud")).toBe("make ‹this› loud")
  })

  it("uses _ for italic, so it does not collide with bold", () => {
    expect(run(toggleItalic, "a ‹word› here")).toBe("a _‹word›_ here")
    expect(run(toggleItalic, "**‹bold›**")).toBe("**_‹bold›_**")
  })

  it("does not read past the start of the text looking for a marker", () => {
    expect(run(toggleBold, "‹a›")).toBe("**‹a›**")
  })
})

describe("toggleCode", () => {
  it("uses backticks for a phrase", () => {
    expect(run(toggleCode, "the ‹flag› value")).toBe("the `‹flag›` value")
  })

  it("fences a selection that spans lines, and selects the code", () => {
    expect(run(toggleCode, "‹one\ntwo›")).toBe("```\n‹one\ntwo›\n```")
  })
})

describe("list toggles", () => {
  it("leaves the caret after the marker on an empty line, not on top of it", () => {
    expect(run(toggleBulletList, "|")).toBe("- |")
  })

  it("prefixes every line the selection touches", () => {
    expect(run(toggleBulletList, "‹one\ntwo\nthree›")).toBe(
      "- ‹one\n- two\n- three›",
    )
  })

  it("removes the marker when every line already has one", () => {
    expect(run(toggleBulletList, "‹- one\n- two›")).toBe("‹one\ntwo›")
  })

  it("numbers from one and keeps counting", () => {
    expect(run(toggleOrderedList, "‹a\nb\nc›")).toBe("1. ‹a\n2. b\n3. c›")
  })

  it("swaps bullets for numbers rather than stacking them", () => {
    expect(run(toggleOrderedList, "‹- a\n- b›")).toBe("1. ‹a\n2. b›")
    expect(run(toggleBulletList, "‹1. a\n2. b›")).toBe("- ‹a\n- b›")
  })

  it("quotes and unquotes", () => {
    expect(run(toggleQuote, "said ‹so›")).toBe("> said ‹so›")
    expect(run(toggleQuote, "> said ‹so›")).toBe("said ‹so›")
  })

  it("works from a caret in the middle of a line", () => {
    expect(run(toggleBulletList, "he|llo")).toBe("- he|llo")
  })
})

describe("cycleHeading", () => {
  it("goes plain → ## → ### → plain", () => {
    expect(run(cycleHeading, "Rules|")).toBe("## Rules|")
    expect(run(cycleHeading, "## Rules|")).toBe("### Rules|")
    expect(run(cycleHeading, "### Rules|")).toBe("Rules|")
  })
})

describe("insertLink", () => {
  it("selects the address when the user brought the words", () => {
    expect(run(insertLink, "see ‹the rules› here")).toBe(
      "see [the rules](‹https://›) here",
    )
  })

  it("selects the words when the user brought the address", () => {
    expect(run(insertLink, "‹https://example.com/rules›")).toBe(
      "[‹link text›](https://example.com/rules)",
    )
  })

  it("offers both halves when nothing is selected", () => {
    expect(run(insertLink, "read |")).toBe("read [‹link text›](https://)")
  })

  it("treats a path into this app as an address", () => {
    expect(run(insertLink, "‹/dashboard›")).toBe("[‹link text›](/dashboard)")
  })
})

describe("continueList", () => {
  it("leaves Enter alone outside a list", () => {
    expect(continueList(parse("just a sentence|"))).toBeNull()
  })

  it("lays down the next bullet", () => {
    expect(run(continueList, "- milk|")).toBe("- milk\n- |")
  })

  it("increments a numbered item", () => {
    expect(run(continueList, "1. first\n2. second|")).toBe(
      "1. first\n2. second\n3. |",
    )
  })

  it("keeps the indent of a nested item", () => {
    expect(run(continueList, "  - nested|")).toBe("  - nested\n  - |")
  })

  it("starts the next checkbox unchecked", () => {
    expect(run(continueList, "- [x] done|")).toBe("- [x] done\n- [ ] |")
  })

  it("ends the list when the item is still empty", () => {
    expect(run(continueList, "- milk\n- |")).toBe("- milk\n|")
  })

  it("continues a quote", () => {
    expect(run(continueList, "> as they said|")).toBe("> as they said\n> |")
  })

  it("declines when there is a selection to replace", () => {
    expect(continueList(parse("- ‹milk›"))).toBeNull()
  })
})

describe("diffRange", () => {
  it("narrows an insertion to the inserted characters", () => {
    expect(diffRange("abc", "abXc")).toEqual({ from: 2, to: 2, text: "X" })
  })

  it("narrows a deletion to the removed characters", () => {
    expect(diffRange("**a**", "a")).toEqual({ from: 0, to: 5, text: "a" })
  })

  it("reports an empty edit when nothing changed", () => {
    expect(diffRange("abc", "abc")).toEqual({ from: 3, to: 3, text: "" })
  })

  it("round-trips: splicing the range reproduces the new text", () => {
    const before = "the quick brown fox"
    const after = "the **quick** brown fox"
    const { from, to, text } = diffRange(before, after)
    expect(before.slice(0, from) + text + before.slice(to)).toBe(after)
  })
})
