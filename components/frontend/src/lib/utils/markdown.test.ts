import { describe, expect, it } from "vitest"

import { renderMarkdown, sanitizeHtml } from "./markdown"

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
