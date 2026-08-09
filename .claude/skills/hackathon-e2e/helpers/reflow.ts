import { expect, type Page } from "@playwright/test"

// Structural layout assertions shared by the reflow sweeps
// (tests/mobile/chrome-reflow.spec.ts owns the multi-width chrome battery,
// tests/mobile/full-sweep.spec.ts owns the every-route sweep). Extracted so
// the two cannot drift: a check that gets smarter here gets smarter for both.
//
// Three properties, each asserted structurally rather than as a screenshot:
//  1. no horizontal overflow — the document must never scroll sideways;
//  2. no two visible elements inside a scope may visibly intersect unless one
//     contains the other — overlap is how a non-wrapping row fails on a
//     narrow screen;
//  3. no text leaf is clipped by its own box (scrollWidth > clientWidth is
//     exactly what a squeezed "H…" wordmark looks like).

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
          const x = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left)
          const y = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top)
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
