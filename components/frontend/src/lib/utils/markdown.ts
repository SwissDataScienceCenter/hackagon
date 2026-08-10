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
