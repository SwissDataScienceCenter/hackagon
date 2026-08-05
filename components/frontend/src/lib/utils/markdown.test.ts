/**
 * Runs under Node with no browser DOM, i.e. exactly the environment SvelteKit
 * renders these pages in. The rest of the frontend suite runs in jsdom (see
 * vite.config.ts), which would hide a sanitizer that only works in a browser —
 * the whole point of picking isomorphic-dompurify. `markdown.dom.test.ts`
 * covers the browser side.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest"
import { renderMarkdown } from "./markdown"

describe("renderMarkdown (SSR environment)", () => {
  it("sanitizes without a browser DOM", () => {
    expect(typeof window).toBe("undefined")
    expect(typeof document).toBe("undefined")
    expect(renderMarkdown("<script>alert(1)</script>ok")).not.toContain(
      "<script",
    )
  })
})

describe("renderMarkdown: markdown rendering", () => {
  it("renders headings, emphasis, lists and links", () => {
    const html = renderMarkdown(
      [
        "# Title",
        "",
        "Some **bold** text.",
        "",
        "- one",
        "- two",
        "",
        "[Docs](https://example.com/docs)",
      ].join("\n"),
    )

    expect(html).toContain("<h1>Title</h1>")
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain("<ul>")
    expect(html).toContain("<li>one</li>")
    expect(html).toContain("<li>two</li>")
    expect(html).toContain('href="https://example.com/docs"')
    expect(html).toContain("Docs</a>")
  })

  it("renders blockquotes, rules, images and code fences", () => {
    const html = renderMarkdown(
      [
        "> quoted",
        "",
        "---",
        "",
        "![alt text](/img/logo.png)",
        "",
        "```js",
        "const x = 1",
        "```",
      ].join("\n"),
    )

    expect(html).toContain("<blockquote>")
    expect(html).toContain("<hr>")
    expect(html).toContain('<img src="/img/logo.png" alt="alt text">')
    expect(html).toContain("<pre>")
    // marked's language hint is the one class allowed to survive.
    expect(html).toContain('<code class="language-js">')
  })

  it("renders GFM tables", () => {
    const html = renderMarkdown(
      ["| a | b |", "| :-- | --: |", "| 1 | 2 |"].join("\n"),
    )

    expect(html).toContain("<table>")
    expect(html).toContain('<th align="left">a</th>')
    expect(html).toContain('<td align="right">2</td>')
  })

  it("dedents markdown indented to match surrounding Svelte markup", () => {
    // Without dedenting, markdown reads the four-space indent as a code block
    // and the whole document renders as one <pre>.
    const html = renderMarkdown("\n    ## About\n\n    Some text.\n")

    expect(html).toContain("<h2>About</h2>")
    expect(html).not.toContain("<pre>")
  })

  it("still renders the indented raw-HTML literal call sites pass today", () => {
    // MarkdownSection's only existing caller passes hand-written HTML in an
    // indented template literal; it has to survive the new pipeline unescaped.
    const html = renderMarkdown(`
    <h2>About the Hackathon</h2>
    <p>
        A two-day event.
    </p>

    <h3>What to expect</h3>
    <ul>
        <li>Day 1: keynotes</li>
    </ul>
`)

    expect(html).toContain("<h2>About the Hackathon</h2>")
    expect(html).toContain("<h3>What to expect</h3>")
    expect(html).toContain("<li>Day 1: keynotes</li>")
    expect(html).toContain("A two-day event.")
    expect(html).not.toContain("&lt;")
  })

  it("returns an empty string for empty, null or undefined input", () => {
    expect(renderMarkdown("")).toBe("")
    expect(renderMarkdown(null)).toBe("")
    expect(renderMarkdown(undefined)).toBe("")
  })
})

describe("renderMarkdown: XSS defences", () => {
  it("strips <script> tags and their contents", () => {
    const html = renderMarkdown(
      "Hello\n\n<script>alert('xss')</script>\n\nWorld",
    )

    expect(html).not.toContain("<script")
    expect(html).not.toContain("alert")
    expect(html).toContain("Hello")
    expect(html).toContain("World")
  })

  it("strips inline <script> inside a paragraph", () => {
    const html = renderMarkdown("Hi <script>alert(1)</script> there")

    expect(html).not.toContain("<script")
    expect(html).not.toContain("alert")
  })

  it("strips event handler attributes", () => {
    const html = renderMarkdown(
      '<img src="/x.png" onerror="alert(1)">\n\n<p onclick="alert(2)">click</p>',
    )

    expect(html).not.toContain("onerror")
    expect(html).not.toContain("onclick")
    expect(html).not.toContain("alert")
    // The elements themselves survive, only the handlers go.
    expect(html).toContain("<img")
    expect(html).toContain("click")
  })

  it("neutralizes javascript: URLs", () => {
    const fromHtml = renderMarkdown('<a href="javascript:alert(1)">click</a>')
    const fromMarkdown = renderMarkdown("[click](javascript:alert)")
    const caseVariant = renderMarkdown(
      '<a href="JaVaScRiPt:alert(1)">click</a>',
    )

    for (const html of [fromHtml, fromMarkdown, caseVariant]) {
      expect(html.toLowerCase()).not.toContain("javascript:")
      expect(html).toContain("click")
    }
  })

  it("strips data: URLs from href and src", () => {
    const html = renderMarkdown(
      '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">\n\n' +
        '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    )

    expect(html).not.toContain("data:")
    expect(html).not.toContain("<script")
  })

  it("strips <style> tags and style attributes", () => {
    const html = renderMarkdown(
      '<style>body{display:none}</style>\n\n<p style="position:fixed;inset:0">x</p>',
    )

    expect(html).not.toContain("<style")
    expect(html).not.toContain("style=")
    expect(html).not.toContain("display:none")
  })

  it("strips <object>, <embed> and form controls", () => {
    const html = renderMarkdown(
      '<object data="/x.swf"></object>\n\n<embed src="/x.swf">\n\n' +
        '<form action="https://evil.example"><input name="pw"><button>go</button></form>',
    )

    expect(html).not.toContain("<object")
    expect(html).not.toContain("<embed")
    expect(html).not.toContain("<form")
    expect(html).not.toContain("<input")
    expect(html).not.toContain("<button")
  })

  it("strips arbitrary class attributes but keeps the code language hint", () => {
    const html = renderMarkdown(
      '<p class="fixed inset-0 z-50 bg-black">overlay</p>',
    )

    expect(html).not.toContain("class=")
    expect(html).toContain("overlay")
    expect(renderMarkdown("```ts\nx\n```")).toContain('class="language-ts"')
  })

  it("strips data-* attributes", () => {
    const html = renderMarkdown('<p data-testid="spoof">x</p>')

    expect(html).not.toContain("data-testid")
  })

  it("forces rel on links and opens external ones in a new tab", () => {
    const external = renderMarkdown("[out](https://example.com)")
    const internal = renderMarkdown("[in](/hackathon/123)")
    const authorTarget = renderMarkdown('<a href="/x" target="_blank">y</a>')

    expect(external).toContain('rel="noopener noreferrer"')
    expect(external).toContain('target="_blank"')

    expect(internal).toContain('rel="noopener noreferrer"')
    expect(internal).not.toContain("target=")

    // Content does not get to choose target for same-site links.
    expect(authorTarget).not.toContain("target=")
  })
})

describe("renderMarkdown: iframe embed allowlist", () => {
  it("keeps YouTube and Vimeo player embeds", () => {
    const youtube = renderMarkdown(
      '<iframe src="https://www.youtube.com/embed/ACDgPmRkniU" title="Recap"></iframe>',
    )
    const vimeo = renderMarkdown(
      '<iframe src="https://player.vimeo.com/video/76979871"></iframe>',
    )

    expect(youtube).toContain('src="https://www.youtube.com/embed/ACDgPmRkniU"')
    expect(youtube).toContain(
      'referrerpolicy="strict-origin-when-cross-origin"',
    )
    expect(youtube).toContain('loading="lazy"')
    expect(youtube).toContain("allowfullscreen")
    expect(vimeo).toContain('src="https://player.vimeo.com/video/76979871"')
  })

  it("removes iframes pointing anywhere else", () => {
    const cases = [
      '<iframe src="https://evil.example/pwn"></iframe>',
      '<iframe src="http://www.youtube.com/embed/abc"></iframe>', // not https
      '<iframe src="https://www.youtube.com.evil.example/embed/abc"></iframe>',
      '<iframe src="https://www.youtube.com/watch?v=abc"></iframe>', // not /embed/
      '<iframe src="javascript:alert(1)"></iframe>',
      "<iframe></iframe>",
    ]

    for (const source of cases) {
      expect(renderMarkdown(source)).not.toContain("<iframe")
    }
  })

  it("does not let an allowlisted embed smuggle srcdoc or sandbox", () => {
    const html = renderMarkdown(
      '<iframe src="https://www.youtube.com/embed/abc" srcdoc="<script>alert(1)</script>" sandbox="allow-forms"></iframe>',
    )

    expect(html).toContain("<iframe")
    expect(html).not.toContain("srcdoc")
    expect(html).not.toContain("sandbox")
    expect(html).not.toContain("alert")
  })
})
