import { describe, expect, it } from "vitest"

import {
  markdownExcerpt,
  markdownToPlainText,
  renderMarkdown,
  sanitizeHtml,
} from "./markdown"

describe("renderMarkdown", () => {
  it("breaks a single newline, the way a chat box does", () => {
    // The whole reason for `breaks: true`: an author who has never written
    // markdown presses Enter once and expects a new line, and strict
    // CommonMark silently reflows those three lines into one paragraph.
    expect(renderMarkdown("Doors 09:00\nTalks 10:00\nJudging 16:00")).toContain(
      "<br>",
    )
  })

  it("still starts a new paragraph on a blank line", () => {
    const html = renderMarkdown("First.\n\nSecond.")
    expect(html).toContain("<p>First.</p>")
    expect(html).toContain("<p>Second.</p>")
  })

  it("renders the GFM constructs the help panel advertises", () => {
    expect(renderMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |")).toContain(
      "<table>",
    )
    expect(renderMarkdown("- [ ] todo")).toContain('type="checkbox"')
    expect(renderMarkdown("~~gone~~")).toContain("<del>")
  })

  it("sends a link to another site into a new tab, without the opener", () => {
    const html = renderMarkdown("[rules](https://example.com/rules)")
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it("keeps a link into this app in the same tab", () => {
    const html = renderMarkdown("[dashboard](/dashboard)")
    expect(html).not.toContain("target=")
  })

  it("strips script and event handlers out of embedded HTML", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).not.toContain("<script")
    expect(renderMarkdown('<img src=x onerror="alert(1)">')).not.toContain(
      "onerror",
    )
  })

  it("drops a javascript: URL rather than linking to it", () => {
    expect(renderMarkdown("[click](javascript:alert(1))")).not.toContain(
      "javascript:",
    )
  })
})

describe("markdownToPlainText", () => {
  it("drops the syntax and keeps the words", () => {
    expect(
      markdownToPlainText("## Welcome!\n\nBring a **laptop** and a `charger`."),
    ).toBe("Welcome! Bring a laptop and a charger.")
  })

  it("puts a space between two blocks rather than joining their words", () => {
    // "First.Second." would be the giveaway that tags were deleted instead of
    // replaced — and the same bug glues every list item into one long word.
    expect(markdownToPlainText("First.\n\nSecond.")).toBe("First. Second.")
    expect(markdownToPlainText("- one\n- two\n- three")).toBe("one two three")
  })

  it("shows a link's text, not its URL", () => {
    expect(markdownToPlainText("See the [rules](https://example.com/x).")).toBe(
      "See the rules.",
    )
  })

  it("unescapes what the renderer escaped", () => {
    expect(markdownToPlainText("Teams of 3 & up, size < 6")).toBe(
      "Teams of 3 & up, size < 6",
    )
  })

  it("takes nothing from a script the sanitizer removed", () => {
    expect(markdownToPlainText("<script>alert(1)</script>Hello")).toBe("Hello")
  })

  it("is empty for content that is only whitespace", () => {
    expect(markdownToPlainText("   \n\n  ")).toBe("")
  })

  it("keeps a tag whole when an attribute value contains a bracket", () => {
    // A serializer does not escape `>` inside an attribute, so a pattern that
    // stops at the first one spills the rest of the tag into the text as
    // `b">rules`. Titles like `3 -> 5 people` are the everyday form of this.
    expect(markdownToPlainText('See the [rules](/x "a>b") now.')).toBe(
      "See the rules now.",
    )
    expect(markdownToPlainText("![width>height](s.png) caption")).toBe(
      "width>height caption",
    )
  })

  it("reads an image's alt text, so an illustrated page is not a blank one", () => {
    expect(markdownToPlainText("![Schedule graphic](s.png)")).toBe(
      "Schedule graphic",
    )
    expect(markdownToPlainText("Doors at 09:00 ![](x.png)")).toBe(
      "Doors at 09:00",
    )
  })

  it("takes nothing from an HTML comment", () => {
    // The sanitizer drops comment nodes, so nothing here strips them by hand.
    // This is the test that says so — if that ever changes, the hidden text
    // starts showing up in list rows and this fails.
    expect(markdownToPlainText("<!-- reviewer note -->Visible")).toBe("Visible")
  })
})

describe("markdownExcerpt", () => {
  it("leaves content that already fits alone, with no ellipsis", () => {
    expect(markdownExcerpt("Doors open at 09:00.")).toBe("Doors open at 09:00.")
  })

  it("cuts at a word boundary and marks the cut", () => {
    expect(markdownExcerpt("alpha bravo charlie delta", 20)).toBe(
      "alpha bravo charlie…",
    )
  })

  it("marks the cut when only the opening of a long body was parsed", () => {
    // Flattening stops at 2 000 characters for cost, so a long body whose text
    // is short still has more page behind it than the excerpt shows. The
    // ellipsis has to come from that, not only from hitting the cap — otherwise
    // a 9 000-character page can present itself as complete.
    const long = `Doors at 09:00.\n\n<!-- ${"x".repeat(2500)} -->`
    expect(long.length).toBeGreaterThan(2000)
    expect(markdownExcerpt(long)).toBe("Doors at 09:00.…")
  })

  it("breaks one very long token rather than returning almost nothing", () => {
    // The boundary is only worth honouring if it is near the end; a 40-character
    // URL with a space at index 1 would otherwise leave a one-letter excerpt.
    expect(markdownExcerpt(`a ${"x".repeat(40)}`, 20)).toBe(
      `a ${"x".repeat(18)}…`,
    )
  })
})

describe("sanitizeHtml", () => {
  it("passes plain markup through untouched", () => {
    expect(sanitizeHtml("<p>hello</p>")).toBe("<p>hello</p>")
  })

  it("applies the same external-link rule as the markdown path", () => {
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toContain(
      'target="_blank"',
    )
  })
})
