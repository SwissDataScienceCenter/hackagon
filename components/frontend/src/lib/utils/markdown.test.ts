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
import {
  markdownExcerpt,
  markdownToPlainText,
  renderMarkdown,
} from "./markdown"

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

  it("is empty for empty, null or undefined input", () => {
    expect(markdownToPlainText("")).toBe("")
    expect(markdownToPlainText(null)).toBe("")
    expect(markdownToPlainText(undefined)).toBe("")
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

// An excerpt is author-controlled content displayed on a management screen, so
// it is a stored-XSS surface in its own right. It is text, not markup — but it
// is text produced by rendering, and these say what the rendering threw away.
// Every one of them asserts a POSITIVE too: "the payload is absent" is a claim
// an empty string satisfies, and the surrounding words are what prove the
// excerpt was produced at all.
describe("markdownToPlainText: XSS defences", () => {
  it("takes nothing from a script the sanitizer removed", () => {
    const text = markdownToPlainText("<script>alert(1)</script>Hello")

    expect(text).toBe("Hello")
    expect(text).not.toContain("alert")
  })

  it("takes nothing from a script buried mid-paragraph", () => {
    const text = markdownToPlainText(
      "Doors at 09:00 <script>window.pwned=1</script> sharp.",
    )

    expect(text).toContain("Doors at 09:00")
    expect(text).toContain("sharp.")
    expect(text).not.toContain("pwned")
    expect(text).not.toContain("window.")
  })

  it("takes nothing from a style block", () => {
    const text = markdownToPlainText(
      "<style>body{display:none}</style>Schedule",
    )

    expect(text).toBe("Schedule")
    expect(text).not.toContain("display:none")
  })

  it("carries no markup out, so nothing downstream can execute it", () => {
    // Whatever an author writes, what leaves here is characters. The row
    // interpolates this (Svelte escapes it); nobody may `{@html}` it.
    const text = markdownToPlainText(
      '<img src=x onerror="alert(1)"> <a href="javascript:alert(2)">go</a>',
    )

    expect(text).toContain("go")
    expect(text).not.toContain("<")
    expect(text).not.toContain("onerror")
    expect(text).not.toContain("javascript:")
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

  it("is empty for empty, null or undefined input", () => {
    expect(markdownExcerpt("")).toBe("")
    expect(markdownExcerpt(null)).toBe("")
    expect(markdownExcerpt(undefined)).toBe("")
  })
})
