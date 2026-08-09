import { test, expect, type Page } from "@playwright/test"

// The page chrome — header, footer, consent banner — must REFLOW at every
// width the app supports, never shrink-and-truncate. This exists because both
// ends broke on a real phone at once (2026-08-09): the header's 1fr_auto_1fr
// grid kept both outer columns equal below md, where the nav between them is
// hidden — the right column (theme switch + Log in + hamburger) held its
// content and the equal-width left column squeezed the wordmark to "H…"; and
// the footer was a fixed-height no-wrap flex row whose three groups need
// ~590px, so at phone widths logos, links and the tagline piled onto each
// other. Neither is a single-viewport bug, so this spec sweeps a range of
// widths on the public pages that mount the full chrome.
//
// Three properties, each asserted structurally rather than as a screenshot:
//  1. no horizontal overflow — the document must never scroll sideways;
//  2. no two visible elements inside the chrome may visibly intersect unless
//     one contains the other — overlap is how a non-wrapping row fails on a
//     narrow screen;
//  3. no chrome text is clipped (scrollWidth > clientWidth is exactly what
//     "H…" is). Below WORDMARK_MIN the wordmark TEXT is deliberately dropped
//     (the logo stays) — hiding on purpose is allowed, eating it is not.

const WIDTHS = [320, 360, 390, 768, 1024, 1440]
const PAGES = ["/", "/about", "/hackathon"]

// The width below which the header hides the wordmark text on purpose.
// Mirrors max-[389px]:hidden in NavBar.svelte (the signed-out bar leaves the
// full word ~22px short at 360, so the drop happens below the 390 class of
// phones rather than letting an ellipsis eat it).
const WORDMARK_MIN = 390

/** Horizontal overflow, with the widest offenders named (same contract as
 * responsive.spec.ts, which owns the 390px battery — this file owns widths). */
async function expectFitsViewport(page: Page, name: string) {
  const { overflow, offenders } = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth + 1
    const offenders = Array.from(document.querySelectorAll("*"))
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter(({ right }) => right > limit)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5)
      .map(({ el, right }) => {
        const cls = String(el.className).split(" ").slice(0, 4).join(".")
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

/** No two visible elements inside `scope` may visibly intersect unless one
 * contains the other. NOT sibling-only, deliberately: a squeezed flex group's
 * border box does not include the children overflowing it, so when the
 * footer's logo strip shrank, the logos spilled over the LINK ROW — a
 * different subtree — while the three groups' own boxes never touched.
 * Sibling-only geometry reported that footer as clean; this caught it.
 * Leaf-ish pairs only (an element and anything not on its ancestor chain),
 * with 2px of tolerance so touching borders and shadows do not read as
 * overlap. */
async function expectNoOverlap(page: Page, scope: string, name: string) {
  const offending = await page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return null
    const visible = (el: Element) => {
      const cs = getComputedStyle(el)
      if (cs.display === "none" || cs.visibility === "hidden") return false
      const r = el.getBoundingClientRect()
      return r.width > 1 && r.height > 1
    }
    const label = (el: Element) => {
      const cls = String(el.className).split(" ").slice(0, 3).join(".")
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`
    }
    const TOL = 2
    const els = Array.from(root.querySelectorAll("*")).filter(visible)
    const offending: string[] = []
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue
        const a = els[i].getBoundingClientRect()
        const b = els[j].getBoundingClientRect()
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (x > TOL && y > TOL)
          offending.push(
            `${label(els[i])} ∩ ${label(els[j])} by ${Math.round(x)}×${Math.round(y)}px`,
          )
      }
    }
    return offending.slice(0, 8)
  }, scope)
  if (offending === null) return // scope not on this page (e.g. banner answered)
  expect(
    offending,
    `${name}: overlapping elements in ${scope}: ${offending.join(" | ")}`,
  ).toHaveLength(0)
}

/** No text leaf inside `scope` may be clipped: scrollWidth beyond clientWidth
 * means an ellipsis or overflow-hidden ate content the layout owed space. */
async function expectNoClippedText(page: Page, scope: string, name: string) {
  const clipped = await page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return null
    return Array.from(root.querySelectorAll("*"))
      .filter(
        (el) =>
          el.children.length === 0 &&
          (el.textContent ?? "").trim().length > 0 &&
          el.scrollWidth > el.clientWidth + 1,
      )
      .map(
        (el) =>
          `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" scroll=${el.scrollWidth} client=${el.clientWidth}`,
      )
  }, scope)
  if (clipped === null) return
  expect(
    clipped,
    `${name}: clipped text in ${scope}: ${clipped.join(" | ")}`,
  ).toHaveLength(0)
}

const BANNER = '[aria-label="Session recording"]'

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: width < 768 ? 844 : 900 } })

    for (const path of PAGES) {
      test(`chrome reflows on ${path}`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState("networkidle").catch(() => {})
        const name = `${width}px ${path}`

        // The scopes must exist, or every check below passes vacuously.
        await expect(page.locator("header")).toBeVisible()
        await expect(page.locator("footer")).toBeVisible()

        // Geometry first: its failures name the offending elements, which is
        // a far better diagnosis than a bare "wordmark not visible".
        await expectFitsViewport(page, name)
        for (const scope of ["header", "footer", BANNER]) {
          await expectNoOverlap(page, scope, name)
          await expectNoClippedText(page, scope, name)
        }

        // The wordmark: logo always; text whole wherever it is shown, and
        // shown at every width except the deliberate sub-360 drop. (A span
        // squeezed to zero width — the broken grid did exactly that — fails
        // toBeVisible, so "present but eaten" cannot pass.)
        const brand = page.locator("header a").first()
        await expect(brand.locator("img:visible").first()).toBeVisible()
        const wordmark = brand.locator("span").first()
        if (width >= WORDMARK_MIN) {
          await expect(
            wordmark,
            "the wordmark text may only be dropped below " +
              `${WORDMARK_MIN}px — at ${width}px it must render`,
          ).toBeVisible()
        }
      })
    }
  })
}
