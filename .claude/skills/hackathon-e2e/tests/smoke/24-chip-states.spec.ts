import { test, expect, type Locator, type Page } from "@playwright/test"

// The chip's four appearances, measured rather than inferred.
//
// The bug: `.chip:hover` is (0,2,0) and `.chip-active` is (0,1,0), so pointing
// at the tab you are already on ERASED its accent tint and painted it with the
// same neutral `raised` an unselected chip gets. Selected and unselected became
// the same pixels for exactly as long as the pointer was on them — which is the
// moment a reader is most likely to be checking which tab is which.
//
// Why this file asserts COMPUTED STYLE and never a class name. `chip-active` was
// on the element the whole time the bug shipped; every class-based assertion
// that could have been written would have passed. That is the
// "locator that contains the thing it asserts about" family from
// .claude/CLAUDE.md, in its CSS form: the class is the INPUT to the rule, and
// what broke was the rule. Only the resolved colour is the fact.
//
// Carrier: the public landing page's Trending tab row — one `chip chip-active`
// ("Hackathons") and two plain `chip` — because it is anonymous, three chips in
// one row, and no fixture data is involved. The rule itself is global to the
// theme, so any `.chip` anywhere would do.

type RGB = [number, number, number]

/**
 * The colour a reader actually sees, as sRGB bytes.
 *
 * Not a regex over the computed string, which was the first attempt and does
 * not survive contact with this theme: `.chip-active` is
 * `color-mix(in oklab, …)` and Firefox reports that back as
 * `oklab(0.8 -0.101689 0.11698 / 0.2)`, while `.chip:hover` resolves to a plain
 * `rgb(…)`. Two syntaxes for the same kind of fact, and one of them names a
 * colour space this file has no business reimplementing.
 *
 * So the browser is asked to paint it. The colour goes onto a 1×1 canvas OVER
 * the page's own background, which resolves both the colour space and the alpha
 * exactly the way the page resolves them — a 20%-accent wash and a 30% one are
 * two different pixels, which is the claim, and reading them as `rgba(…,0.2)`
 * vs `rgba(…,0.3)` would have been a claim about the stylesheet instead.
 *
 * `fillStyle` silently KEEPS its previous value when handed something it cannot
 * parse, so an unsupported syntax would quietly measure whatever was set last
 * and every comparison would come out equal — a vacuous pass of the worst kind.
 * The sentinel makes that a thrown error.
 */
async function paintedColour(
  page: Page,
  value: string,
  over: string,
): Promise<RGB> {
  const out = await page.evaluate(
    ([v, backdrop]) => {
      const canvas = document.createElement("canvas")
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext("2d")
      if (!ctx) return null

      const SENTINEL = "#ff00ff"
      ctx.fillStyle = SENTINEL
      ctx.fillStyle = v
      if (ctx.fillStyle === SENTINEL) return null

      ctx.fillStyle = backdrop
      ctx.fillRect(0, 0, 1, 1)
      ctx.fillStyle = v
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data

      return [d[0], d[1], d[2]]
    },
    [value, over] as const,
  )
  if (!out) {
    throw new Error(
      `the browser could not paint '${value}' — nothing was measured`,
    )
  }

  return out as RGB
}

/** Straight-line distance in sRGB between two painted colours. */
function colourDistance(a: RGB, b: RGB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/**
 * A settled computed value.
 *
 * `.chip` carries `transition: background-color 120ms ease`, and
 * `getComputedStyle` mid-transition returns the INTERMEDIATE colour — so a read
 * taken straight after `hover()` is a point on the way to the answer and would
 * make every comparison below timing-dependent. Reads until two consecutive
 * samples agree rather than sleeping a guessed interval.
 */
async function settledStyle(
  el: Locator,
  prop: "background-color" | "color",
): Promise<string> {
  const read = () =>
    el.evaluate((node, p) => getComputedStyle(node).getPropertyValue(p), prop)

  let previous = await read()
  for (let i = 0; i < 25; i++) {
    await el.page().waitForTimeout(40)
    const current = await read()
    if (current === previous) return current
    previous = current
  }
  throw new Error(`${prop} never settled on this element`)
}

interface ChipPaint {
  background: RGB
  /** Kept as the computed string: it is compared for equality, never measured. */
  ink: string
}

/** Move the pointer off every chip and let the transition finish. */
async function unhover(page: Page) {
  await page.mouse.move(0, 0)
}

async function paintOf(el: Locator, backdrop: string): Promise<ChipPaint> {
  const background = await settledStyle(el, "background-color")

  return {
    background: await paintedColour(el.page(), background, backdrop),
    ink: await settledStyle(el, "color"),
  }
}

/**
 * The whole claim, as one function, so the control below can call the exact
 * check the real test calls rather than a lookalike.
 *
 * Four appearances, and every pair that must differ:
 *
 *   selected at rest   ─┬─ vs unselected at rest   : selection is visible
 *                       └─ vs selected hovered     : hover answers on it too
 *   unselected at rest ─── vs unselected hovered   : hover stays visible
 *   unselected hovered ─── vs selected hovered     : THE BUG — these were equal
 *
 * Plus the "reads as both" claim, which the four inequalities alone do not
 * make: a selected-and-hovered chip painted some unrelated third colour would
 * satisfy all of them. It has to stay in the accent family, so its background
 * is required to be NEARER to selected-at-rest than to unselected-hovered, and
 * its ink has to be the selected ink exactly.
 */
async function expectChipStatesDistinct(page: Page) {
  const row = page.locator("#trending")
  const selected = row.locator("button.chip.chip-active")
  const unselected = row.locator("button.chip:not(.chip-active)").first()

  // Positive control for the whole file: without both kinds of chip on screen
  // every comparison below is between two reads of the same element.
  await expect(
    selected,
    "the landing page must render one selected chip",
  ).toHaveCount(1)
  await expect(unselected, "…and at least one unselected chip").toBeVisible()

  // The backdrop these washes are composited over: the chips sit directly on the
  // page in the Trending row, with no card between them, so the body's own
  // background is what shows through a `transparent` chip. Read once and used
  // for all four, which is what makes the four numbers comparable.
  const backdrop = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  )

  await unhover(page)
  const selectedRest = await paintOf(selected, backdrop)
  const unselectedRest = await paintOf(unselected, backdrop)

  await unselected.hover()
  const unselectedHover = await paintOf(unselected, backdrop)

  await selected.hover()
  const selectedHover = await paintOf(selected, backdrop)

  await unhover(page)

  const d = (a: ChipPaint, b: ChipPaint) =>
    colourDistance(a.background, b.background)
  const show = (c: ChipPaint) => `rgb(${c.background.join(",")})`
  // 8 rather than 0: two colours a reader cannot tell apart are not two states,
  // and an exact-inequality check would accept a one-unit rounding difference
  // as a distinguishable style.
  const VISIBLE = 8

  expect(
    d(selectedRest, unselectedRest),
    `the selected chip is painted like an unselected one at rest ` +
      `(${show(selectedRest)} vs ${show(unselectedRest)})`,
  ).toBeGreaterThan(VISIBLE)

  // `> 0`, not `> VISIBLE`, and deliberately so. HOW FAR the unselected hover
  // moves is a design decision that differs by colour mode — light mode's
  // `raised` is two lightness points from `canvas` — and this file has no
  // business ruling on it. That the hover rule REACHES the chip at all is the
  // property; the integers come from getImageData, so equality here is exact
  // rather than approximate.
  expect(
    d(unselectedRest, unselectedHover),
    `hover does not change an unselected chip at all ` +
      `(${show(unselectedRest)} vs ${show(unselectedHover)})`,
  ).toBeGreaterThan(0)

  // The regression itself. Before the fix both of these resolved to
  // `--color-raised` with `--color-ink`, i.e. the selection vanished under the
  // pointer.
  expect(
    d(unselectedHover, selectedHover),
    `THE BUG: a hovered selected chip is painted exactly like a hovered ` +
      `unselected one (${show(selectedHover)} vs ${show(unselectedHover)}) — ` +
      `.chip:hover (0,2,0) is beating .chip-active (0,1,0)`,
  ).toBeGreaterThan(VISIBLE)

  expect(
    d(selectedRest, selectedHover),
    `the selected chip does not answer the pointer at all ` +
      `(${show(selectedRest)} vs ${show(selectedHover)})`,
  ).toBeGreaterThan(VISIBLE)

  // Reads as BOTH: still accent-tinted, not merely "some other colour".
  expect(
    d(selectedHover, selectedRest),
    `selected-and-hovered has left the accent family: it is nearer to the ` +
      `unselected hover (${show(unselectedHover)}) than to the selected ` +
      `rest state (${show(selectedRest)})`,
  ).toBeLessThan(d(selectedHover, unselectedHover))

  expect(
    selectedHover.ink,
    `a hovered selected chip must keep the selected ink (${selectedRest.ink}); ` +
      `it took the unselected hover ink (${unselectedHover.ink}) instead`,
  ).toBe(selectedRest.ink)
}

test.describe("chip states stay distinguishable", () => {
  test("selected, hovered, and selected-and-hovered are three different chips", async ({
    page,
  }) => {
    await page.goto("/")
    await expectChipStatesDistinct(page)
  })

  // ─── Control: the check, shown failing ──────────────────────────────────────
  //
  // Deleting the rule from the live CSSOM restores the exact stylesheet that
  // shipped the bug, so this is the defect itself rather than an imitation of
  // it. Done in the page rather than by editing the theme and re-running by
  // hand: a source edit proves it once, for whoever was watching, and then
  // stops existing.
  test("CONTROL: without .chip-active:hover the check fails", async ({
    page,
  }) => {
    await page.goto("/")

    // Passes as it stands, first — a check that threw unconditionally would
    // look exactly like a good one from here.
    await expectChipStatesDistinct(page)

    const deleted = await page.evaluate(() => {
      // Anything that OWNS rules and can drop one: a stylesheet, or a grouping
      // rule. `@layer components { … }` wraps this whole theme, so the rule is
      // never at the top level of the sheet and the walk has to recurse — and
      // deletion is by index ON THE OWNER, which is why the owner is what gets
      // passed down rather than a bare CSSRuleList.
      type RuleOwner = {
        cssRules: CSSRuleList
        deleteRule(index: number): void
      }

      const strip = (owner: RuleOwner): number => {
        let n = 0
        const rules = owner.cssRules
        // Backwards: deleting shifts every later index down by one.
        for (let i = rules.length - 1; i >= 0; i--) {
          const rule = rules[i] as CSSRule &
            Partial<RuleOwner> & { selectorText?: string }
          if (rule.cssRules && typeof rule.deleteRule === "function") {
            n += strip(rule as unknown as RuleOwner)
          }
          if (rule.selectorText === ".chip-active:hover") {
            owner.deleteRule(i)
            n++
          }
        }

        return n
      }

      let total = 0
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          total += strip(sheet)
        } catch {
          // A cross-origin sheet cannot be read; none of ours are.
        }
      }

      return total
    })

    expect(
      deleted,
      "the control removed no rule — either the selector was renamed (update " +
        "this control with it) or the fix is not in the stylesheet at all, and " +
        "the test above is passing for some other reason",
    ).toBeGreaterThan(0)

    await expect(
      expectChipStatesDistinct(page),
      "with the rule gone the selected chip is repainted by .chip:hover, and " +
        "this check is what must say so",
    ).rejects.toThrow(/THE BUG/)
  })
})
