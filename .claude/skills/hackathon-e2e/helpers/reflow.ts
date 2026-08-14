import { expect, type Page } from "@playwright/test"

// Structural layout assertions shared by the reflow sweeps
// (tests/mobile/chrome-reflow.spec.ts owns the multi-width chrome battery,
// tests/mobile/full-sweep.spec.ts owns the every-route sweep). Extracted so
// the two cannot drift: a check that gets smarter here gets smarter for both.
//
// Four properties, each asserted structurally rather than as a screenshot:
//  1. no horizontal overflow — the document must never scroll sideways;
//  2. no two visible elements inside a scope may visibly intersect unless one
//     contains the other — overlap is how a non-wrapping row fails on a
//     narrow screen;
//  3. no text leaf is clipped by its own box (scrollWidth > clientWidth is
//     exactly what a squeezed "H…" wordmark looks like);
//  4. the consent banner — the one piece of chrome that LAYERS over the page —
//     is on screen without being asked to be, and covers no control once the
//     document is scrolled to its end (expectConsentBannerClearsContent);
//  5. the footer exists on this route and its links are hit-testable at
//     the bottom of the document (expectFooterOperable). Presence is a claim
//     of its own here — the footer is the only inbound link to the platform's
//     own SitePages, and it was absent from the whole signed-in half of the app
//     while checks 2 and 3 "passed" on it by returning early;
//  6. no two links inside the footer landmark answer to the same accessible
//     name (expectFooterLinkNamesUnique) — a screen reader's link list is a
//     flat list of NAMES, so two "About"s in one region are two destinations
//     a reader cannot choose between.

/** Horizontal overflow, with the widest offenders named (same contract as
 * responsive.spec.ts, which owns the 390px battery). */
export async function expectFitsViewport(page: Page, name: string) {
  const { overflow, offenders } = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth + 1
    const offenders = Array.from(document.querySelectorAll("*"))
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter(({ right }) => right > limit)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5)
      .map(({ el, right }) => {
        // getAttribute, not className: on SVG elements className is an
        // SVGAnimatedString and stringifies uselessly.
        const cls = (el.getAttribute("class") ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 4)
          .join(".")
        return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} right=${Math.round(right)}`
      })
    return {
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      offenders,
    }
  })
  expect(
    overflow,
    `${name} overflows horizontally by ${overflow}px; widest: ${offenders.join(" | ")}`,
  ).toBeLessThanOrEqual(1)
}

export interface OverlapOptions {
  /**
   * Also skip pairs where one rect fully CONTAINS the other geometrically
   * (with the same 2px slack), not just DOM-ancestor pairs.
   *
   * Off for the chrome — the header and footer layer nothing on purpose, so
   * any intersection there is a defect. On for page CONTENT, where full
   * geometric containment is how deliberate layering looks: a status badge on
   * a card's cover image, a search icon inside an input's padding, an avatar
   * monogram over its disc. What this deliberately KEEPS flagging is partial
   * intersection — two boxes fighting over the same space, which is what a
   * squeezed flex row actually produces (the broken footer's logos poked into
   * the link row; none of those boxes contained another).
   */
  skipGeometricContainment?: boolean
}

/** No two visible elements inside `scope` may visibly intersect unless one
 * contains the other. NOT sibling-only, deliberately: a squeezed flex group's
 * border box does not include the children overflowing it, so when the
 * footer's logo strip shrank, the logos spilled over the LINK ROW — a
 * different subtree — while the three groups' own boxes never touched.
 * Sibling-only geometry reported that footer as clean; this caught it.
 * Leaf-ish pairs only (an element and anything not on its ancestor chain),
 * with 2px of tolerance so touching borders and shadows do not read as
 * overlap. */
export async function expectNoOverlap(
  page: Page,
  scope: string,
  name: string,
  opts: OverlapOptions = {},
) {
  const offending = await page.evaluate(
    ({ sel, skipContainment }) => {
      const root = document.querySelector(sel)
      if (!root) return null
      const visible = (el: Element) => {
        const cs = getComputedStyle(el)
        if (
          cs.display === "none" ||
          cs.visibility === "hidden" ||
          Number(cs.opacity) === 0
        )
          return false
        // Content of a CLOSED <details> is not rendered, but Firefox still
        // reports author display values and non-zero rects for it — which is
        // how a hidden preview list "overlapped" the section below it.
        const details = el.closest("details")
        if (details && !details.open && !el.closest("summary")) return false
        const r = el.getBoundingClientRect()
        return r.width > 1 && r.height > 1
      }
      const label = (el: Element) => {
        const cls = (el.getAttribute("class") ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join(".")
        return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`
      }
      const TOL = 2
      // An <svg> is one glyph: its internal paths and lines cross each other
      // by design (that is what drawing IS), so the icon participates as a
      // single box and its internals are never paired.
      const items = Array.from(root.querySelectorAll("*"))
        .filter((el) => !(el as SVGElement).ownerSVGElement)
        .filter(visible)
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
      const contains = (a: DOMRect, b: DOMRect) =>
        b.left >= a.left - TOL &&
        b.right <= a.right + TOL &&
        b.top >= a.top - TOL &&
        b.bottom <= a.bottom + TOL
      const offending: string[] = []
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const A = items[i]
          const B = items[j]
          if (A.el.contains(B.el) || B.el.contains(A.el)) continue
          const x =
            Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left)
          const y =
            Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top)
          if (x <= TOL || y <= TOL) continue
          if (skipContainment && (contains(A.r, B.r) || contains(B.r, A.r)))
            continue
          // An avatar stack overlaps on purpose: Tailwind's negative
          // space-x utilities exist to shingle children. A pair whose
          // members sit under the SAME -space-x container is that design;
          // the selector's leading dash keeps positive space-x-* (a gap,
          // where overlap would still be a bug) out of the pardon.
          if (skipContainment) {
            const stackA = A.el.closest('[class*="-space-x-"]')
            if (stackA && stackA === B.el.closest('[class*="-space-x-"]'))
              continue
          }
          offending.push(
            `${label(A.el)} ∩ ${label(B.el)} by ${Math.round(x)}×${Math.round(y)}px`,
          )
          if (offending.length >= 8) return offending
        }
      }
      return offending
    },
    { sel: scope, skipContainment: opts.skipGeometricContainment ?? false },
  )
  if (offending === null) return // scope not on this page (e.g. banner answered)
  expect(
    offending,
    `${name}: overlapping elements in ${scope}: ${offending.join(" | ")}`,
  ).toHaveLength(0)
}

export interface ClippedTextOptions {
  /**
   * Treat `text-overflow: ellipsis` as deliberate and skip it. Off for the
   * chrome (an ellipsis eating the wordmark is the very bug the chrome sweep
   * exists for); on for page content, where truncating an arbitrarily long
   * user string — a repo URL in a table cell, a project title on a chip — is
   * a design decision, and the visible "…" says so to the reader.
   */
  allowEllipsis?: boolean
  /**
   * Skip text inside an `overflow-x: auto|scroll` ancestor. A horizontal
   * scroller is the sanctioned way for a wide table to exist at 360px — the
   * content is reachable by scrolling ITS container, not clipped.
   */
  allowInsideHorizontalScroller?: boolean
}

/** No text leaf inside `scope` may be clipped: scrollWidth beyond clientWidth
 * means an ellipsis or overflow-hidden ate content the layout owed space. */
export async function expectNoClippedText(
  page: Page,
  scope: string,
  name: string,
  opts: ClippedTextOptions = {},
) {
  const clipped = await page.evaluate(
    ({ sel, allowEllipsis, allowHScroll }) => {
      const root = document.querySelector(sel)
      if (!root) return null
      const inHScroller = (el: Element) => {
        for (
          let p: Element | null = el;
          p && p !== root.parentElement;
          p = p.parentElement
        ) {
          const o = getComputedStyle(p).overflowX
          if (o === "auto" || o === "scroll") return true
        }
        return false
      }
      return Array.from(root.querySelectorAll("*"))
        .filter((el) => {
          // Closed-<details> content is unrendered; Firefox still measures it.
          const details = el.closest("details")
          return !(details && !details.open && !el.closest("summary"))
        })
        .filter(
          (el) =>
            el.children.length === 0 &&
            (el.textContent ?? "").trim().length > 0 &&
            // clientWidth is 0 by spec for inline boxes, which cannot clip —
            // their text wraps or extends the line. Only a box with real
            // client width can eat text.
            el.clientWidth > 0 &&
            // …except the sr-only signature, a deliberate 1×1 clipped box.
            // BOTH dimensions, so a span squeezed to 1px WIDE by a broken
            // layout (it would keep its full line height) still fails.
            !(el.clientWidth <= 1 && el.clientHeight <= 1) &&
            el.scrollWidth > el.clientWidth + 1,
        )
        .filter((el) => {
          if (allowEllipsis && getComputedStyle(el).textOverflow === "ellipsis")
            return false
          if (allowHScroll && inHScroller(el)) return false
          return true
        })
        .map(
          (el) =>
            `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" scroll=${el.scrollWidth} client=${el.clientWidth}`,
        )
    },
    {
      sel: scope,
      allowEllipsis: opts.allowEllipsis ?? false,
      allowHScroll: opts.allowInsideHorizontalScroller ?? false,
    },
  )
  if (clipped === null) return
  expect(
    clipped,
    `${name}: clipped text in ${scope}: ${clipped.join(" | ")}`,
  ).toHaveLength(0)
}

// ─── The site footer: present AND clickable ──────────────────────────────────

/**
 * The links the footer carries, each with the nav landmark that owns it.
 *
 * Privacy, Terms of use and About are SitePages — `[slug=sitepage]` records
 * authored in /manage/pages — and this footer is the ONLY inbound link to any
 * of them. A route without it is a route from which the platform's own pages
 * cannot be reached.
 *
 * ⚠ "About Hackagon", not "About" — and the history is the reason this file
 * says so twice. develop's rebuilt footer (`02658384`) put the SDSC org site's
 * links beside ours, one of them named exactly "About" (datascience.ch/about,
 * next to our /about), so footer-wide these constants matched TWO links each
 * pointing somewhere different. This scoped to the nav landmark to survive
 * that, which made the tooling correct and left the product broken: a landmark
 * is exactly the context a screen reader's link list discards.
 *
 * The product side is fixed now — our link carries the SitePage's own title —
 * and `expectFooterLinkNamesUnique` below is what stops it coming back. The
 * landmark scoping stays anyway: it costs nothing and it says WHICH link each
 * of these means, which a bare name never did.
 */
export const FOOTER_LINKS: { label: string; nav: string }[] = [
  { label: "Hackathons", nav: "Platform" },
  { label: "Dashboard", nav: "Platform" },
  { label: "About Hackagon", nav: "Platform" },
  { label: "Privacy", nav: "Legal" },
  { label: "Terms of use", nav: "Legal" },
]

/**
 * TWO claims, and the second is the one that keeps costing money here.
 *
 *  1. THE FOOTER IS THERE. Asserted on the <footer> itself, exactly once —
 *     never on a page-wide getByText("Privacy"), which also matches the
 *     consent sentence and any prose on a privacy page. It went missing for
 *     real: the `(public)`/`(app)` route split (5551b8d) gave each group its
 *     own copy of the shell and only `(public)`'s mounted AppFooter, so the
 *     entire signed-in half of the app — dashboard, /manage/*, all 21
 *     /my/hackathon/* pages — shipped without one. Nothing turned red, because
 *     expectNoOverlap and expectNoClippedText RETURN EARLY when their scope is
 *     not on the page: the sweep's two "footer" checks had been measuring an
 *     element that was not there.
 *
 *  2. ITS LINKS CAN BE CLICKED, at the bottom of the document, which is the
 *     only place they ever are. "Visible" is not "operable": the consent
 *     banner covered these exact four links at every width while it was
 *     `fixed bottom-0`, and a viewport-anchored sidebar can cover them at any
 *     scroll position at all. So this hit-tests — `elementFromPoint` at each
 *     link's own centre must land on that link — which is agnostic about WHAT
 *     is on top and therefore cannot be defeated by the next thing that is.
 *
 * Scroll position is restored, so it composes with the other checks.
 */
export async function expectFooterOperable(page: Page, name: string) {
  const footer = page.locator("footer")
  await expect(
    footer,
    `${name}: expected exactly one <footer>. Zero means this route's layout ` +
      `group does not mount AppFooter — and the footer is the only way to ` +
      `reach /privacy, /terms and /about. More than one means a page mounted ` +
      `its own on top of the shell's`,
  ).toHaveCount(1)
  await expect(footer).toBeVisible()

  for (const { label, nav } of FOOTER_LINKS) {
    await expect(
      footer
        .getByRole("navigation", { name: nav })
        .getByRole("link", { name: label, exact: true }),
      `${name}: the footer's "${nav}" nav carries no "${label}" link`,
    ).toHaveCount(1)
  }

  const restore = await page.evaluate(() => window.scrollY)
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  )
  // A scroll is applied at layout time; read it back in a later task or a
  // sticky element reports its pre-scroll rect (same reason as the banner
  // check below).
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => r(null))),
  )

  const blocked = await page.evaluate(() => {
    const f = document.querySelector("footer")
    if (!f) return null
    const label = (el: Element) => {
      const cls = (el.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(".")
      const aria = el.getAttribute("aria-label")
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${aria ? ` [${aria}]` : ""}`
    }
    const out: string[] = []
    for (const a of Array.from(f.querySelectorAll("a[href]"))) {
      const text = (a.textContent ?? "").trim().slice(0, 20)
      const r = a.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) {
        out.push(`"${text}" has no box (${r.width}x${r.height})`)
        continue
      }
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      if (
        x < 0 ||
        y < 0 ||
        x > document.documentElement.clientWidth ||
        y > document.documentElement.clientHeight
      ) {
        out.push(
          `"${text}" is off screen at the END of the document (${Math.round(x)},${Math.round(y)}) — ` +
            `no scroll position reaches it`,
        )
        continue
      }
      const hit = document.elementFromPoint(x, y)
      if (!hit || !(hit === a || a.contains(hit))) {
        out.push(
          `"${text}" is covered by ${hit ? label(hit) : "nothing hittable"}`,
        )
      }
    }
    return out
  })

  await page.evaluate((y) => window.scrollTo(0, y), restore)

  if (blocked === null) return // asserted present above
  expect(
    blocked,
    `${name}: ${blocked.length} footer link(s) cannot be clicked with the ` +
      `document scrolled to its end — something is drawn on top of them, and ` +
      `the footer is the only route to the platform's own pages: ` +
      blocked.join(" | "),
  ).toEqual([])
}

// ─── Footer link NAMES: what a screen reader's link list would show ──────────

/** One link, as a link list would list it: its destination, the name a screen
 * reader announces for it, and whether following it leaves the current tab. */
export interface NamedLink {
  href: string
  name: string
  target: string
}

/**
 * Every link inside the footer landmark, with its ACCESSIBLE NAME — not its
 * text.
 *
 * The difference is not academic and this repo has already paid for it once:
 * the first version of the off-site check read `aria-label ?? textContent` and
 * reported the two parent-institution logos as nameless. They are
 * `<a><img alt="ETH Zurich"></a>` — perfectly well named, by the alt text of
 * the image inside them, which is content and therefore part of the name. A
 * check that calls a correct page broken gets deleted, so the computation lives
 * here now and both footer name checks share it.
 *
 * What it covers is what this footer uses: `aria-label` wins, otherwise the
 * link's content, and content includes `alt`. No `aria-labelledby` (nothing
 * here uses one) and no `title` fallback. That approximation is deliberately
 * NOT trusted on its own — it ENUMERATES candidates, and
 * `expectFooterLinkNamesUnique` hands each one back to Playwright's own
 * spec-compliant role/name engine to be counted. If the two ever disagree, the
 * count comes back 0 and the assertion says so rather than quietly agreeing.
 *
 * Whitespace is normalised for the same reason: an accessible name is
 * collapsed and trimmed, and these labels sit on their own indented lines in
 * the markup.
 *
 * ⚠ Content is gathered in DOCUMENT ORDER, which the first version was not: it
 * read `textContent` and then appended every `alt`, so a link whose image comes
 * BEFORE its text was named back to front. That is not academic either — the
 * parent-institution logos are `<a><img alt="ETH Zurich"><span class="sr-only">
 * (opens in a new tab)</span></a>`, and the old order called that
 * "(opens in a new tab) ETH Zurich", a name no screen reader would ever say.
 * The uniqueness check below hands these names back to Playwright's own engine
 * to be counted, so a back-to-front name does not read as a wrong name — it
 * comes back with a count of 0 and reads as a MISSING link.
 */
export async function footerLinkNames(page: Page): Promise<NamedLink[]> {
  return page
    .locator("footer")
    .getByRole("link")
    .evaluateAll((els) =>
      els.map((e) => {
        // Depth-first over child nodes: text as itself, <img> as its alt, and
        // anything carrying its own aria-label as that label (it names its
        // subtree, so recursing past it would double-count).
        const parts: string[] = []
        const walk = (n: Node) => {
          for (const c of Array.from(n.childNodes)) {
            if (c.nodeType === Node.TEXT_NODE) parts.push(c.textContent ?? "")
            else if (c.nodeType === Node.ELEMENT_NODE) {
              const el = c as Element
              if (el.tagName === "IMG") parts.push(el.getAttribute("alt") ?? "")
              else if (el.hasAttribute("aria-label"))
                parts.push(el.getAttribute("aria-label") ?? "")
              else walk(el)
            }
          }
        }
        walk(e)
        return {
          href: e.getAttribute("href") ?? "",
          target: e.getAttribute("target") ?? "",
          name: (e.getAttribute("aria-label") ?? parts.join(" "))
            .replace(/\s+/g, " ")
            .trim(),
        }
      }),
    )
}

/**
 * Inside the footer landmark, an accessible name identifies exactly ONE link.
 *
 * The bug this exists for shipped in develop's rebuilt footer (`02658384`):
 * our own /about link and datascience.ch/about were both named exactly
 * "About". Nothing on screen was wrong — the column headings ("Platform",
 * "SDSC") tell them apart perfectly — but a screen reader's link list is a flat
 * list of NAMES, and headings are the first thing it throws away. Someone
 * pulling up that list saw "About, About" and could not tell which one leaves
 * the site.
 *
 * ⚠ It is the PROPERTY that is asserted, never a list of expected names. The
 * previous generation of this check compared the footer against a five-entry
 * constant, which made it a claim about the footer's SIZE — it went wrong the
 * day develop grew the footer to fourteen links, i.e. on a copy edit rather
 * than on a defect (.claude/CLAUDE.md, `03-dashboard`'s `connectedCount: 3` is
 * the same disease). Uniqueness holds at four links and at forty.
 *
 * Two positive controls, because this is an absence claim and an absence claim
 * with nothing behind it agrees with everything: the footer must carry links at
 * all (an empty footer has no duplicates), and none of them may be nameless (an
 * icon-only anchor that lost its aria-label is invisible to the same reader,
 * and empty names would otherwise collide with each other in a way this loop
 * would have to special-case).
 */
export async function expectFooterLinkNamesUnique(page: Page, name: string) {
  const footer = page.locator("footer")
  await expect(footer, `${name}: expected exactly one <footer>`).toHaveCount(1)

  const links = await footerLinkNames(page)

  expect(
    links.length,
    `${name}: the footer carries no links at all — a footer that is gone has ` +
      `no duplicate names either, which is the one way this check could agree ` +
      `with the thing it is looking for`,
  ).toBeGreaterThan(4)

  expect(
    links.filter((l) => l.name === "").map((l) => l.href),
    `${name}: a footer link has no accessible name — an icon-only anchor whose ` +
      `aria-label was dropped looks perfectly fine on screen and does not ` +
      `exist for a screen reader`,
  ).toEqual([])

  for (const wanted of new Set(links.map((l) => l.name))) {
    const sharing = links.filter((l) => l.name === wanted).map((l) => l.href)
    await expect(
      footer.getByRole("link", { name: wanted, exact: true }),
      `${name}: "${wanted}" does not name exactly one link in the footer. ` +
        `Candidates computed from the DOM: ${sharing.join(", ")}. Two links ` +
        `with one name cannot be told apart in a screen reader's link list — ` +
        `give each one its destination's own title in its VISIBLE text (an ` +
        `aria-label would hide the fix from voice control). A count of ZERO ` +
        `instead means footerLinkNames() and Playwright's own accessible-name ` +
        `computation have drifted apart, which is a bug in this helper`,
    ).toHaveCount(1)
  }
}

/**
 * A link that moves you to a new tab must SAY so in its accessible name.
 *
 * `target="_blank"` is a silent instruction: it changes where you end up and
 * announces nothing. Sighted visitors get no icon here, and a screen reader
 * gets no word — the SDSC column's nav landmark is named "Swiss Data Science
 * Center", which would tell you, and a link list is a flat list of NAMES with
 * exactly that context thrown away. Same failure mode as the two "About"s one
 * column apart that `expectFooterLinkNamesUnique` exists for.
 *
 * ⚠ A PROPERTY over whatever opens a new tab, never a list of the five links it
 * was written for. A list would be an assertion about how many off-site links
 * the footer HAS — which is the mistake the uniqueness check shipped once, when
 * its five-entry constant broke the day the footer grew to fourteen links.
 *
 * The fix it asks for is a visually-hidden suffix INSIDE the anchor, which
 * appends to the accessible name and leaves the visible word contained in it.
 * An aria-label would replace that word, so "click Events" would stop working
 * for voice control (WCAG 2.5.3) — the same trade that made the About
 * collision a visible-text fix. Icon-only anchors are the exception and may
 * extend their aria-label: there is no visible text there to contradict.
 */
export async function expectNewTabLinksAnnounced(page: Page, name: string) {
  const newTab = (await footerLinkNames(page)).filter(
    (l) => l.target === "_blank",
  )

  // Positive control: every assertion here is an absence, and an empty array
  // satisfies all of them.
  expect(
    newTab.length,
    `${name}: no footer link opens in a new tab at all — SDSC's five content ` +
      `links, the two parent-institution logos and the three social icons all ` +
      `do, so an empty set means the off-site row is gone rather than fixed`,
  ).toBeGreaterThanOrEqual(4)

  expect(
    newTab
      .filter((l) => !/opens in a new tab/i.test(l.name))
      .map((l) => `${l.name || "(unnamed)"} → ${l.href}`),
    `${name}: a footer link opens in a new tab without saying so in its ` +
      `accessible name. Append a visually-hidden suffix inside the anchor ` +
      `(class="sr-only"), which ADDS to the name; an aria-label would REPLACE ` +
      `the visible word and break voice control`,
  ).toEqual([])
}

// ─── The consent banner: visible AND never in the way ────────────────────────

/** The session-replay consent banner. The one piece of chrome that is drawn
 * OVER the page rather than beside it, so it gets its own contract. */
export const CONSENT_BANNER = '[aria-label="Session recording"]'

/**
 * What a person operates. A banner drawn over a paragraph is cosmetic; one
 * drawn over a checkbox is a dead control, and that is the bug this exists
 * for: the banner was `fixed bottom-0 z-[60]` with nothing reserving its
 * space, so on any page whose controls reach the bottom of the viewport they
 * could not be clicked AT ALL — no scroll position moved them out from under
 * it, because the document had no room to scroll. The journey died on its 10th
 * action with 338 not run, Playwright retrying for the full 60s against
 * `<div role="region" aria-label="Session recording"> intercepts pointer
 * events` on `/manage/pages`' `visible` checkbox.
 *
 * `input:not([type=hidden])` because a hidden input has no box; `summary`
 * because a native <details> is the disclosure control in this app.
 */
const INTERACTIVE = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  "label[for]",
  "[role=button]",
  "[role=link]",
  "[role=checkbox]",
  "[role=switch]",
  "[role=tab]",
  "[contenteditable=true]",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

/** A rounding allowance, not a design allowance. */
const TOP_SLACK = 2

/**
 * TWO claims about the consent banner, and they pull in opposite directions —
 * which is the whole reason both are asserted:
 *
 *  1. IT IS NOTICED. At the top of the page it is fully inside the viewport,
 *     without anyone scrolling. Moving it into normal flow at the end of a
 *     long document would make the coverage check below pass trivially and the
 *     ask invisible, which trades one bug for another.
 *  2. IT IS NEVER IN THE WAY. With the document scrolled to its end — the
 *     furthest anything can be moved out from under a viewport-pinned banner —
 *     no interactive element outside the banner may intersect it. That is the
 *     reachability property: every control has SOME scroll position at which
 *     it is clickable, and the last band of the document belongs to the banner
 *     itself rather than to content.
 *
 * Both are checked with consent NOT given (the suites never answer the ask),
 * which is the state a first-time visitor is in and the only state in which
 * the banner exists at all. The banner MUST be present: a run where it is
 * missing verifies nothing here, so its absence fails loudly rather than
 * passing quietly — `scripts/run.sh mobile` makes sure a `replay` block is
 * configured for exactly this reason.
 *
 * Scroll position is restored, so this can run alongside the other checks
 * without moving the page under them.
 */
export async function expectConsentBannerClearsContent(
  page: Page,
  name: string,
) {
  await expect(
    page.locator(CONSENT_BANNER),
    `${name}: the session-replay consent banner is not on this page, so this ` +
      `check would verify nothing. It renders when the frontend config has a ` +
      `\`replay\` block AND this browser has not answered the ask yet — run ` +
      `the suite through scripts/run.sh (it configures one), and do not grant ` +
      `consent in a layout test`,
  ).toBeVisible()

  const probe = async () =>
    page.evaluate(
      ({ sel, interactive }) => {
        const banner = document.querySelector(sel)
        if (!banner) return null
        const b = banner.getBoundingClientRect()
        const TOL = 2
        const label = (el: Element) => {
          const cls = (el.getAttribute("class") ?? "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 3)
            .join(".")
          const text = (el.textContent ?? "").trim().slice(0, 24)
          return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`
        }
        /**
         * The part of an element that is actually PAINTED: its border box,
         * cut down by every ancestor that clips.
         *
         * Without this the check reports elements nobody can see. The
         * hackathon sidebar's nav is `overflow-y-auto` with ~370px of entries
         * hanging below its scrollport; those entries have real rects, they
         * land squarely in the banner's band, and they are invisible — so the
         * check called the banner a lid on four links that were not on screen
         * at all, on 21 routes, and went on saying so after the defect was
         * fixed. An element scrolled out of its own scroller is reached by
         * scrolling THAT scroller; what matters is whether the scrollport's
         * visible area is clear of the banner, which is exactly what clipping
         * to it measures.
         *
         * Per-axis, because `overflow-x: auto` on a wide table is the
         * sanctioned pattern here and says nothing about vertical extent. A
         * `position: fixed` box escapes ancestor clipping entirely, so it is
         * returned as-is — those are the elements that CANNOT be scrolled out
         * from under the banner, and they must stay in.
         */
        const painted = (el: Element) => {
          const r = el.getBoundingClientRect()
          const box = {
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
          }
          if (getComputedStyle(el).position === "fixed") return box
          for (let p = el.parentElement; p; p = p.parentElement) {
            const cs = getComputedStyle(p)
            const pr = p.getBoundingClientRect()
            if (cs.overflowY !== "visible") {
              box.top = Math.max(box.top, pr.top)
              box.bottom = Math.min(box.bottom, pr.bottom)
            }
            if (cs.overflowX !== "visible") {
              box.left = Math.max(box.left, pr.left)
              box.right = Math.min(box.right, pr.right)
            }
            if (box.bottom - box.top <= 1 || box.right - box.left <= 1)
              return null
            if (cs.position === "fixed") break
          }
          return box
        }

        const covered: string[] = []
        for (const el of Array.from(document.querySelectorAll(interactive))) {
          if (banner.contains(el) || el.contains(banner)) continue
          const cs = getComputedStyle(el)
          if (
            cs.display === "none" ||
            cs.visibility === "hidden" ||
            Number(cs.opacity) === 0
          )
            continue
          // Closed-<details> content is not rendered, but Firefox still
          // reports boxes for it (same pardon as expectNoOverlap).
          const details = el.closest("details")
          if (details && !details.open && !el.closest("summary")) continue
          const r = painted(el)
          if (!r) continue // clipped away by a scroller: not on screen at all
          if (r.right - r.left <= 1 || r.bottom - r.top <= 1) continue
          const x = Math.min(r.right, b.right) - Math.max(r.left, b.left)
          const y = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)
          if (x <= TOL || y <= TOL) continue
          covered.push(`${label(el)} by ${Math.round(x)}×${Math.round(y)}px`)
          if (covered.length >= 8) break
        }
        return {
          top: Math.round(b.top),
          bottom: Math.round(b.bottom),
          height: Math.round(b.height),
          viewport: document.documentElement.clientHeight,
          doc: document.documentElement.scrollHeight,
          scrollY: Math.round(window.scrollY),
          covered,
        }
      },
      { sel: CONSENT_BANNER, interactive: INTERACTIVE },
    )

  // A scroll is applied at layout time, so read it back in a later task rather
  // than measuring in the same one — a sticky box that has not been re-laid-out
  // reports its old rect and this whole check becomes a coin toss.
  const settle = async () => {
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => r(null))),
    )
  }

  const restore = await page.evaluate(() => window.scrollY)

  await page.evaluate(() => window.scrollTo(0, 0))
  await settle()
  const atTop = await probe()

  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  )
  await settle()
  const atEnd = await probe()

  await page.evaluate((y) => window.scrollTo(0, y), restore)

  if (atTop === null || atEnd === null) return // asserted visible above

  // 1. On screen at the top of the page, whole.
  expect(
    atTop.top >= -TOP_SLACK && atTop.bottom <= atTop.viewport + TOP_SLACK,
    `${name}: the consent banner is not fully on screen at the top of the ` +
      `page (top=${atTop.top} bottom=${atTop.bottom} viewport=${atTop.viewport}). ` +
      `An ask nobody sees is not an ask — it must stay pinned to the viewport, ` +
      `not sit in flow at the end of a long document`,
  ).toBe(true)

  // 2. Nothing operable underneath it once the document is at its end.
  expect(
    atEnd.covered,
    `${name}: the consent banner covers ${atEnd.covered.length} interactive ` +
      `element(s) with the document scrolled to its END, so no scroll position ` +
      `frees them — they cannot be clicked while the ask is up. The banner ` +
      `must reserve its own ${atEnd.height}px in the document (it is ` +
      `${atEnd.doc}px tall, viewport ${atEnd.viewport}px): ` +
      atEnd.covered.join(" | "),
  ).toEqual([])
}
