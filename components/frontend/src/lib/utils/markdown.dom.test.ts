/**
 * Browser-side half of the markdown pipeline check. `markdown.test.ts` runs the
 * full policy under Node (SSR); this file re-checks the load-bearing defences
 * in jsdom, because the component also renders during hydration and both sides
 * must agree.
 */

import { describe, expect, it } from "vitest"
import { renderMarkdown } from "./markdown"

describe("renderMarkdown (browser environment)", () => {
  it("has a DOM available", () => {
    expect(typeof window).not.toBe("undefined")
  })

  it("renders ordinary markdown", () => {
    const html = renderMarkdown("## Hi\n\n- **a**\n\n[l](https://example.com)")

    expect(html).toContain("<h2>Hi</h2>")
    expect(html).toContain("<strong>a</strong>")
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it("strips scripts, handlers, javascript: URLs and stray iframes", () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src="/x.png" onerror="alert(2)">\n\n' +
        '<a href="javascript:alert(3)">l</a>\n\n<iframe src="https://evil.example"></iframe>',
    )

    expect(html).not.toContain("<script")
    expect(html).not.toContain("onerror")
    expect(html.toLowerCase()).not.toContain("javascript:")
    expect(html).not.toContain("<iframe")
    expect(html).not.toContain("alert")
  })
})
