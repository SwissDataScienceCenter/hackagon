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
