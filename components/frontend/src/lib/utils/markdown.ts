import DOMPurify from "isomorphic-dompurify"
import { marked } from "marked"

/**
 * Turning author-written markdown into HTML we are willing to put on a page.
 *
 * Both halves of the app go through here — the editor's preview pane and the
 * page that finally shows the text — so a preview cannot promise something the
 * reader will not get.
 */

/**
 * A link that leaves the app opens in a new tab, and never hands the opener
 * over with it. This is registered globally on purpose: it should hold for
 * every piece of HTML the app sanitizes, not only the markdown half, which is
 * why `sanitizeHtml` below lives here too rather than in a caller.
 */
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "A") return

  const href = node.getAttribute("href") ?? ""
  // Relative links point back into this app; keeping them in the tab is what
  // lets someone follow one and still have their form state behind them.
  if (!/^https?:\/\//i.test(href)) return

  node.setAttribute("target", "_blank")
  node.setAttribute("rel", "noopener noreferrer")
})

/** Sanitizes HTML that is already HTML. Markdown should use `renderMarkdown`. */
export const sanitizeHtml = (html: string): string => DOMPurify.sanitize(html)

/**
 * `breaks: true` is the deliberate departure from strict CommonMark: an author
 * who presses Enter once gets a line break, the way every chat box and comment
 * field they have used behaves. Without it their address block or their list of
 * dates silently reflows into one paragraph, and there is no error to explain
 * why — by far the most common thing to go wrong for someone who has not
 * written markdown before.
 */
export const renderMarkdown = (content: string): string =>
  sanitizeHtml(marked.parse(content, { async: false, gfm: true, breaks: true }))

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

const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref: string) => {
    if (!ref.startsWith("#")) return NAMED_ENTITIES[ref.toLowerCase()] ?? whole

    const code =
      ref[1] === "x" || ref[1] === "X"
        ? parseInt(ref.slice(2), 16)
        : Number(ref.slice(1))
    // A reference past the last code point is not a character, and asking for it
    // throws. Leaving it as written is the harmless answer.
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return whole
    return String.fromCodePoint(code)
  })

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
 * stops at the first `>` it sees leaves the rest of the tag — `b">rules` — sitting
 * in the excerpt as text. Relying on the values being quoted is safe here and
 * only here: the input is never author HTML, it is what DOMPurify serialized.
 */
const HTML_TAG = /<\/?([a-z][a-z0-9]*)\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi

/**
 * A page's content flattened to a single line of plain text.
 *
 * Rendering first and stripping the tags afterwards, rather than unpicking the
 * syntax with patterns, is what keeps this honest: a construct is flattened the
 * way marked read it rather than the way a regex guessed, and anything the
 * sanitizer throws away — a `<script>` body, an event handler — is gone from the
 * excerpt too.
 */
export const markdownToPlainText = (content: string): string =>
  decodeEntities(
    renderMarkdown(content).replace(HTML_TAG, (whole: string, tag: string) => {
      const name = tag.toLowerCase()
      // An image is the one tag carrying its words in an attribute rather than
      // between its ends. Dropping it silently is how a page that is nothing but
      // a venue map or a schedule graphic comes out as no content at all.
      if (name === "img") {
        const alt = /\balt="([^"]*)"/i.exec(whole)?.[1]
        return alt ? ` ${alt} ` : " "
      }
      return INLINE_TAGS.has(name) ? "" : " "
    }),
  )
    .replace(/\s+/g, " ")
    .trim()

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
export const markdownExcerpt = (content: string, maxLength = 400): string => {
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
