/**
 * Safe markdown -> HTML rendering (audit finding F6, stored XSS).
 *
 * `MarkdownSection.svelte` used to `{@html}` its input with neither a markdown
 * parser nor a sanitizer. The moment that input stops being a hard-coded
 * literal and becomes database content (SitePage.content, Page.content,
 * Hackathon.description) that is stored XSS: any author — or anyone who can
 * get a string into those columns — could ship `<script>` to every visitor.
 * This module is the one place where markdown becomes HTML, and it always
 * sanitizes.
 *
 * Pipeline: markdown -> marked (GFM) -> DOMPurify allowlist -> string.
 *
 * Why `isomorphic-dompurify` rather than plain `dompurify` or `sanitize-html`:
 * these pages are rendered by SvelteKit on the server (Node, where there is no
 * browser DOM) and again in the browser during hydration, so the sanitizer has
 * to work in both. `isomorphic-dompurify` is DOMPurify with a JSDOM window
 * supplied automatically under Node and the native DOM in the browser, so a
 * single policy covers both sides and the HTML leaving the server is already
 * safe before any client sees it. DOMPurify parses the HTML the way a browser
 * does and filters the resulting DOM, which is why it resists the mutation and
 * mXSS tricks that string/regex-based filters historically fall for.
 */

import DOMPurify from "isomorphic-dompurify"
import { Marked } from "marked"

// A dedicated instance so the module never mutates marked's global options.
// Raw HTML in the source is deliberately NOT escaped here: DOMPurify below is
// the single place where the safety decision is made, and escaping twice would
// break legitimate inline HTML while adding no protection.
const markdown = new Marked({ gfm: true, breaks: false })

/**
 * Sanitizer policy — deliberately an allowlist, so anything not named here is
 * dropped rather than judged.
 *
 * Allowed: headings, paragraphs, line breaks, rules, blockquotes, lists,
 * inline emphasis, code/pre, links, images, tables — i.e. what markdown itself
 * can produce — plus `<iframe>` narrowed to a host allowlist (see
 * EMBED_ALLOWLIST).
 *
 * Stripped, by virtue of not being on the list: `<script>`, `<style>`,
 * `<object>`, `<embed>`, `<form>`/`<input>`/`<button>` and every other form
 * control, `<link>`/`<meta>`/`<base>`, `<svg>`/`<math>` (mXSS vectors), and
 * `<template>`. FORBID_TAGS repeats the most important of those so the intent
 * is greppable and survives edits to ALLOWED_TAGS.
 *
 * Consequence worth knowing: GFM task lists lose their checkbox, because
 * marked renders it as `<input type="checkbox">` and no form control is
 * allowed. The item text is kept.
 */
const ALLOWED_TAGS = [
  // Block text
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "blockquote",
  "pre",
  // Lists
  "ul",
  "ol",
  "li",
  // Inline
  "a",
  "code",
  "strong",
  "em",
  "b",
  "i",
  "s",
  "del",
  "sub",
  "sup",
  // Media
  "img",
  "iframe",
  // Tables (GFM)
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
]

/**
 * Attribute allowlist. Everything not named here is dropped, which is what
 * removes every event handler (`onclick`, `onerror`, `onload`, …) and `style`.
 *
 * Note what is absent on purpose: `target`, `rel`, `referrerpolicy`,
 * `loading`, `allowfullscreen`, `sandbox` and `srcdoc`. The author never gets
 * to set those — the afterSanitizeAttributes hook below sets the first five
 * itself, so their values cannot be influenced by content.
 *
 * `class` is allowed here only so the hook can inspect it; it survives just on
 * `<code>`/`<pre>` as marked's `language-*` hint. Arbitrary classes are
 * removed because this app ships Tailwind globally, and a free `class`
 * attribute is enough to build a full-viewport overlay over the page.
 */
const ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "title",
  "align", // marked emits align="left|right|center" on GFM table cells
  "width",
  "height",
  "colspan",
  "rowspan",
  "start", // <ol start="3">
  "class", // narrowed to language-* on code/pre by the hook below
]

/**
 * URL scheme policy for href/src: http(s), mailto, and relative URLs
 * (`/page`, `#anchor`, `page.html`) only.
 *
 * This is DOMPurify's default pattern minus `data:`, `tel:`, `callto:`,
 * `sms:`, `cid:`, `xmpp:` and `ftp:`. `javascript:` was never on it. `data:`
 * is excluded because `data:text/html` is script execution and even
 * `data:image/svg+xml` can carry script; images must be hosted, not inlined.
 * An attribute whose value fails this test is removed entirely.
 */
const ALLOWED_URI_REGEXP =
  /^(?:https?:|mailto:|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

const SANITIZE_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOWED_URI_REGEXP,
  // Redundant with the allowlist above; kept as an explicit statement of
  // intent so a future edit to ALLOWED_TAGS cannot quietly re-admit them.
  FORBID_TAGS: [
    "script",
    "style",
    "noscript",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "select",
    "option",
    "textarea",
    "link",
    "meta",
    "base",
    "template",
    "svg",
    "math",
  ],
  // `data-*` attributes are inert on their own but are how component code
  // picks elements out of the DOM; content does not get to plant them.
  ALLOW_DATA_ATTR: false,
  // aria-* is inert and helps screen readers, so it stays.
  ALLOW_ARIA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // Refuse `id`/`name` values that would shadow DOM properties (clobbering).
  SANITIZE_DOM: true,
  KEEP_CONTENT: true,
}

/**
 * The only iframes that survive: YouTube and Vimeo player URLs over https.
 *
 * The audit asks for allowlisted video embeds, and organizer-authored pages
 * genuinely want a recap video. The host + path check below is the entire
 * control — an iframe pointing anywhere else is removed, not just stripped of
 * attributes. No `sandbox` attribute is added: both players need
 * `allow-scripts allow-same-origin`, which together neuter most of what
 * sandbox would buy, and getting the flags wrong silently breaks playback.
 */
const EMBED_ALLOWLIST: ReadonlyArray<{ host: string; path: RegExp }> = [
  { host: "www.youtube.com", path: /^\/embed\/[\w-]{1,64}$/ },
  { host: "youtube.com", path: /^\/embed\/[\w-]{1,64}$/ },
  { host: "www.youtube-nocookie.com", path: /^\/embed\/[\w-]{1,64}$/ },
  { host: "youtube-nocookie.com", path: /^\/embed\/[\w-]{1,64}$/ },
  { host: "player.vimeo.com", path: /^\/video\/\d{1,20}$/ },
]

function isAllowedEmbed(src: string | null): boolean {
  if (!src) return false
  let url: URL
  try {
    url = new URL(src)
  } catch {
    // Relative or malformed: never an allowed embed. (`javascript:...` parses
    // fine here and is rejected by the protocol check below.)
    return false
  }
  if (url.protocol !== "https:") return false
  const host = url.hostname.toLowerCase()
  return EMBED_ALLOWLIST.some(
    (e) => e.host === host && e.path.test(url.pathname),
  )
}

const LANGUAGE_CLASS = /^language-[\w+#.-]{1,32}$/

const URI_ATTRS = ["href", "src"]

function isDataUri(value: string): boolean {
  return value.trim().toLowerCase().startsWith("data:")
}

// Hooks are registered once, when this module is first imported. DOMPurify's
// default export is a per-process singleton, so these apply to every
// sanitize() call in the app — this module is meant to be the only caller.
// Both hooks are idempotent, so a re-import (Vite HMR) cannot corrupt them.

// Drop iframes that are not on the embed allowlist. This runs before attribute
// sanitizing, so `src` is still the raw author value — isAllowedEmbed parses
// it defensively and fails closed.
DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "iframe") return
  const el = node as Element
  const src =
    typeof el.getAttribute === "function" ? el.getAttribute("src") : null
  if (!isAllowedEmbed(src)) el.parentNode?.removeChild(el)
})

// Force the attributes content is not allowed to choose for itself.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  const tag = node.tagName.toLowerCase()

  // DOMPurify lets `data:` URIs through on media tags (its built-in
  // DATA_URI_TAGS exception) whatever ALLOWED_URI_REGEXP says, so
  // `<img src="data:...">` would survive the config above. Our policy allows
  // no data: URIs at all — they are unreviewable inline payloads — so drop
  // them here. Anything that reached this point starts with a literal `data:`,
  // DOMPurify having already rejected whitespace-padded variants.
  for (const attr of URI_ATTRS) {
    const value = node.getAttribute(attr)
    if (value !== null && isDataUri(value)) node.removeAttribute(attr)
  }

  if (node.hasAttribute("class")) {
    const isCodeHint =
      (tag === "code" || tag === "pre") &&
      LANGUAGE_CLASS.test(node.getAttribute("class") ?? "")
    if (!isCodeHint) node.removeAttribute("class")
  }

  if (tag === "a") {
    // rel goes on every link: it covers author-written `target` too, which we
    // strip below but which a future policy change might let through.
    node.setAttribute("rel", "noopener noreferrer")
    if (/^https?:\/\//i.test(node.getAttribute("href") ?? "")) {
      node.setAttribute("target", "_blank")
    } else {
      // Same-site links stay in the tab so SvelteKit can client-route them.
      node.removeAttribute("target")
    }
  }

  if (tag === "iframe") {
    node.setAttribute("referrerpolicy", "strict-origin-when-cross-origin")
    node.setAttribute("loading", "lazy")
    node.setAttribute("allowfullscreen", "")
  }
})

/**
 * Strips the indentation shared by every line.
 *
 * Svelte call sites pass markdown as a template literal indented to match the
 * surrounding markup, and markdown reads a four-space indent as a code block —
 * without this the whole document would render as one `<pre>`. Content coming
 * from the database starts at column 0, where this is a no-op.
 */
function dedent(src: string): string {
  const lines = src.split("\n")
  let indent = Number.POSITIVE_INFINITY
  for (const line of lines) {
    if (line.trim() === "") continue
    indent = Math.min(indent, line.length - line.trimStart().length)
  }
  if (!Number.isFinite(indent) || indent === 0) return src
  return lines.map((line) => line.slice(indent)).join("\n")
}

/**
 * Renders untrusted markdown to HTML that is safe to pass to `{@html}`.
 *
 * Works identically under SSR (Node) and in the browser. Accepts null/undefined
 * so optional database columns can be passed straight through.
 */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return ""
  const html = markdown.parse(dedent(md), { async: false })
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}

/**
 * The named entities marked and the sanitizer escape on the way out. Numeric
 * references are handled generically below, so this only has to cover the five
 * names they actually emit plus the space nobody types deliberately.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (whole, ref: string) => {
      if (!ref.startsWith("#"))
        return NAMED_ENTITIES[ref.toLowerCase()] ?? whole

      const code =
        ref[1] === "x" || ref[1] === "X"
          ? parseInt(ref.slice(2), 16)
          : Number(ref.slice(1))
      // A reference past the last code point is not a character, and asking for
      // it throws. Leaving it as written is the harmless answer.
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return whole
      return String.fromCodePoint(code)
    },
  )
}

/**
 * Tags that sit inside a sentence rather than ending one. They vanish; every
 * other tag becomes a space.
 *
 * The distinction is the whole trick to flattening HTML into a readable line.
 * Delete every tag and two paragraphs collide into `First.Second.`; turn every
 * tag into a space and the full stop after a link drifts off the word it
 * belongs to — `See the rules .`. `br` is deliberately not here: it is a line
 * ending, so it earns its space.
 */
const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr",
])

/**
 * One tag of the sanitizer's own output.
 *
 * Quoted attribute values are consumed whole rather than scanned for the next
 * `>`, because serializing an attribute does not escape one: a link written
 * `[rules](/x "a>b")` really is emitted as `title="a>b"`, and a pattern that
 * stops at the first `>` it sees leaves the rest of the tag — `b">rules` —
 * sitting in the excerpt as text. Relying on the values being quoted is safe
 * here and only here: the input is never author HTML, it is what DOMPurify
 * serialized.
 */
const HTML_TAG = /<\/?([a-z][a-z0-9]*)\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi

/**
 * A page's content flattened to a single line of plain text.
 *
 * Rendering through `renderMarkdown` first and stripping the tags afterwards,
 * rather than unpicking the syntax with patterns, is what keeps this honest —
 * and safe. A construct is flattened the way marked read it rather than the way
 * a regex guessed, and anything the sanitizer throws away (a `<script>` body,
 * an event handler, a `<style>` rule) is gone from the excerpt too. There is no
 * second renderer here and no second sanitizer policy: this is the audited
 * pipeline with its tags removed.
 *
 * The result is TEXT, never markup — callers interpolate it, they never
 * `{@html}` it.
 */
export function markdownToPlainText(md: string | null | undefined): string {
  const stripped = renderMarkdown(md).replace(
    HTML_TAG,
    (whole: string, tag: string) => {
      const name = tag.toLowerCase()
      // An image is the one tag carrying its words in an attribute rather than
      // between its ends. Dropping it silently is how a page that is nothing
      // but a venue map or a schedule graphic comes out as no content at all.
      if (name === "img") {
        const alt = /\balt="([^"]*)"/i.exec(whole)?.[1]
        return alt ? ` ${alt} ` : " "
      }
      return INLINE_TAGS.has(name) ? "" : " "
    },
  )
  return decodeEntities(stripped).replace(/\s+/g, " ").trim()
}

/**
 * How much of a body can possibly be needed to fill an excerpt. Generous
 * against `maxLength` below, since markdown is mostly characters that flatten
 * away.
 */
const FLATTEN_LIMIT = 2000

/**
 * `markdownToPlainText`, cut to a length a list row can carry.
 *
 * The cap is about what crosses the wire — page bodies run to 10 000 characters
 * and a list has no use for them — not about what is visible: the row clamps to
 * a fixed number of lines, and on a narrow screen that clamp bites long before
 * this does. Cutting at the last space avoids ending on half a word.
 */
export function markdownExcerpt(
  md: string | null | undefined,
  maxLength = 400,
): string {
  const content = md ?? ""
  // Only the opening can ever be shown, so only the opening is parsed. Without
  // this, a list of twenty pages runs marked and a jsdom-backed sanitizer over
  // 200 000 characters on every load to show a few hundred of them. The margin
  // over `maxLength` is for the syntax that will be thrown away.
  const flattened = content.length > FLATTEN_LIMIT
  const text = markdownToPlainText(content.slice(0, FLATTEN_LIMIT))

  // Cut short by the limit above rather than by the cap below: there is more
  // page here, and the ellipsis is what says so.
  if (text.length <= maxLength) return flattened && text ? `${text}…` : text

  const cut = text.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(" ")
  // Only honour the word boundary if it is near the end. One very long token —
  // a URL, a hash — would otherwise throw away most of the excerpt to avoid
  // breaking a word that has nothing to break.
  const kept = lastSpace > maxLength * 0.8 ? cut.slice(0, lastSpace) : cut
  return `${kept.trimEnd()}…`
}
