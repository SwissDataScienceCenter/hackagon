import { test, expect, type Locator, type Page } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import { myHackathonId } from "../../helpers/discover.js"
import { rpcAs } from "../../helpers/api.js"
import { SEED_HACKATHONS } from "../../personas.js"

// A hackathon's own page CMS (`/my/hackathon/<id>/pages`) — the per-event one,
// not the platform's `/manage/pages`, which `06-cms-pages` covers.
//
// Two things this screen learned, and one thing it must never learn:
//
//   * each row previews its page's opening line, so the list says something
//     about the pages behind it rather than listing three titles;
//   * a row can be dragged into place, and — because HTML5 drag fires from
//     neither a key press nor a touch — picked up from the keyboard as well,
//     both writing the whole sequence with ONE `PageService.SetOrder` call;
//   * that preview must never render an author's markup. Page content is
//     markdown from the database, `act0.about.xss` pastes a `<script>` into
//     content on purpose, and a management screen is exactly where a stored
//     payload would be read by the person with the most authority.
//
// Every reorder assertion is made AFTER A RELOAD, and then read back off
// `PageService.List` as well. A drag that only moved a node on screen and a
// drag that was saved look identical until you ask someone else.
//
// The seeded order is captured and restored by each reorder test, so the shared
// database is left as it was found; the XSS probe creates its own page and
// deletes it again.

const EXCERPT = "[data-testid=page-excerpt]"
const ANNOUNCEMENT = "[data-testid=reorder-announcement]"

const XSS_TITLE = "Venue notes"
const XSS_MARKER = "__pagePreviewXss"
const XSS_CONTENT = [
  "Doors open at 08:30.",
  "",
  `<script>window.${XSS_MARKER} = 'executed'</script>`,
  "",
  `<img src=x onerror="window.${XSS_MARKER} = 'executed'">`,
  "",
  "See you there.",
].join("\n")

/** A row of the list, found by the title it STATES (its heading). */
const row = (page: Page, title: string): Locator =>
  page
    .locator("[data-page-row]")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })

/** The titles in the order the list renders them. */
async function shownOrder(page: Page): Promise<string[]> {
  const titles = await page.locator("[data-page-row] h3").allTextContents()
  return titles.map((t) => t.trim())
}

/** The titles in the order the BACKEND holds them — `List` sorts by `order`. */
async function storedOrder(hackathonId: string): Promise<string[]> {
  const res = await rpcAs("alice", "hackathon.PageService/List", {
    hackathonId,
  })
  if (!res.ok) throw new Error(`PageService.List failed: ${res.raw}`)
  return ((res.data?.pages ?? []) as { title: string }[]).map((p) => p.title)
}

/**
 * Drag one row onto another with real mouse input.
 *
 * Deliberately `page.mouse` rather than `dragTo`: the handler moves the row
 * under the pointer as it passes, so the drag has to actually TRAVEL over the
 * rows in between — a single jump to the destination reorders nothing, and a
 * `dragTo` that half-works would be the kind of flake this suite cannot carry.
 * The destination box is read before the drag starts, because the list
 * rearranges itself underneath the pointer while it moves.
 */
async function dragRowTo(source: Locator, destination: Locator) {
  const page = source.page()
  // Grab the row by its title: the whole row is draggable, but starting on the
  // handle or a link means fighting a control for the mousedown.
  const from = await source.locator("h3").boundingBox()
  const to = await destination.boundingBox()
  if (!from || !to) throw new Error("a row to drag is not on screen")

  const startX = from.x + Math.min(from.width / 2, 40)
  const startY = from.y + from.height / 2
  const endY = to.y + to.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // A small first move is what makes the browser begin a drag at all; the rest
  // travels in steps so `dragover` fires on every row on the way.
  await page.mouse.move(startX, startY + (endY > startY ? 8 : -8), { steps: 4 })
  await page.mouse.move(startX, endY, { steps: 24 })
  await page.mouse.move(startX, endY, { steps: 4 })
  await page.mouse.up()
}

/** Wait for the one `SetOrder` write a reorder is allowed to make. */
function awaitSetOrder(page: Page) {
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("setOrder"),
  )
}

test.describe.configure({ mode: "serial" })

test.describe("hackathon pages: preview and reorder", () => {
  test.use({ storageState: storageStatePath("alice") })

  let hackathonId = ""

  test.beforeEach(async ({ page }) => {
    if (!hackathonId) {
      hackathonId = await myHackathonId(page, SEED_HACKATHONS.h1.name)
    }
    await page.goto(`/my/hackathon/${hackathonId}/pages`)
    await page.waitForLoadState("networkidle")
  })

  test("each row previews its page as text, with the markdown parsed away", async ({
    page,
  }) => {
    // Every row carries one, so an assertion below cannot be passing because
    // the element it names is simply missing from that row.
    const excerpts = page.locator(EXCERPT)
    const rowCount = await page.locator("[data-page-row]").count()
    expect(rowCount, "the seed should give h1 several pages").toBeGreaterThan(1)
    await expect(excerpts).toHaveCount(rowCount)

    // The seeded Schedule page is `## Day 1 – Ideation` followed by a list of
    // times. This one string proves three separate things: the `##` is gone,
    // the `-` bullets are gone, and a SPACE was put between two blocks rather
    // than their words being glued into `Ideation09:00`.
    const schedule = row(page, "Schedule").locator(EXCERPT)
    await expect(schedule).toContainText(
      "Day 1 – Ideation 09:00 Opening ceremony",
    )
    await expect(schedule).toContainText("10:00 Team formation")
    expect(await schedule.textContent()).not.toContain("##")
    expect(await schedule.textContent()).not.toContain("- 09:00")

    const welcome = row(page, "Welcome").locator(EXCERPT)
    await expect(welcome).toContainText(
      "Welcome to AI Innovation Challenge 2026 Join us for three days",
    )

    // The excerpt's way out. `View` reaches the page as a participant gets it,
    // where the same markdown is RENDERED rather than flattened — so the `##`
    // that vanished above is a real heading here.
    await row(page, "Schedule")
      .getByRole("link", { name: "View Schedule" })
      .click()
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible()
    await expect(page.locator(".markdown-content h2").first()).toHaveText(
      "Day 1 – Ideation",
    )
  })

  test("a script pasted into a page's content cannot run from the list", async ({
    page,
  }) => {
    await page.goto(`/my/hackathon/${hackathonId}/pages/new`)
    await page.locator('input[name="title"]').fill(XSS_TITLE)
    await page.locator('textarea[name="content"]').fill(XSS_CONTENT)
    await page.getByRole("button", { name: "Add page", exact: true }).click()

    const probe = row(page, XSS_TITLE)
    await expect(probe).toBeVisible()

    try {
      // CONTROL. Without this the rest of the test is a claim about a payload
      // that may never have reached the database — an input the CMS silently
      // dropped would satisfy every assertion below.
      await probe.getByRole("link", { name: `Edit ${XSS_TITLE}` }).click()
      const stored = await page.locator('textarea[name="content"]').inputValue()
      expect(stored, "the payload must really be stored").toContain(
        `<script>window.${XSS_MARKER}`,
      )
      expect(stored).toContain("onerror=")

      await page.goto(`/my/hackathon/${hackathonId}/pages`)
      await page.waitForLoadState("networkidle")

      const excerpt = row(page, XSS_TITLE).locator(EXCERPT)
      // POSITIVE first: the excerpt was produced, and it is the prose either
      // side of the payload. An empty row would satisfy every "not" below.
      await expect(excerpt).toHaveText("Doors open at 08:30. See you there.")

      const text = (await excerpt.textContent()) ?? ""
      expect(text).not.toContain(XSS_MARKER)
      expect(text).not.toContain("script")
      expect(text).not.toContain("onerror")
      // Nothing markup-shaped leaves the flattener, so there is nothing for a
      // careless `{@html}` downstream to run either.
      const html = await excerpt.innerHTML()
      expect(html).not.toContain("<script")
      expect(html).not.toContain("onerror")
      expect(html).not.toContain(XSS_MARKER)
      expect(
        await row(page, XSS_TITLE).locator("script").count(),
        "no script element may be built out of page content",
      ).toBe(0)
      expect(
        await page.evaluate(
          (k) => (window as unknown as Record<string, unknown>)[k],
          XSS_MARKER,
        ),
        "the payload must not have executed on the management list",
      ).toBeUndefined()

      // And the same page where the markdown is genuinely RENDERED, since that
      // is the surface the flattener inherits its policy from.
      await row(page, XSS_TITLE)
        .getByRole("link", { name: `View ${XSS_TITLE}` })
        .click()
      await expect(page.locator(".markdown-content")).toContainText(
        "Doors open at 08:30.",
      )
      expect(await page.locator(".markdown-content").innerHTML()).not.toContain(
        XSS_MARKER,
      )
      expect(
        await page.evaluate(
          (k) => (window as unknown as Record<string, unknown>)[k],
          XSS_MARKER,
        ),
        "the payload must not have executed on the page itself",
      ).toBeUndefined()
    } finally {
      // Leave the fixture as it was found, whatever happened above.
      await page.goto(`/my/hackathon/${hackathonId}/pages`)
      await page.waitForLoadState("networkidle")
      const stale = row(page, XSS_TITLE)
      if ((await stale.count()) > 0) {
        await stale.getByRole("link", { name: `Edit ${XSS_TITLE}` }).click()
        await page
          .getByRole("button", { name: "Delete page", exact: true })
          .click()
        await page
          .getByRole("button", { name: "Delete permanently", exact: true })
          .click()
        await page.waitForURL(`**/my/hackathon/${hackathonId}/pages`)
        await expect(row(page, XSS_TITLE)).toHaveCount(0)
      }
    }
  })

  test("dragging a row saves the whole new order in one write", async ({
    page,
  }) => {
    const before = await shownOrder(page)
    expect(
      before.length,
      "need at least three pages to prove a move",
    ).toBeGreaterThan(2)
    expect(
      await storedOrder(hackathonId),
      "the screen and the database must agree before we touch anything",
    ).toEqual(before)

    const last = before[before.length - 1]!
    const first = before[0]!

    // --- last row to the top ------------------------------------------------
    let saved = awaitSetOrder(page)
    await dragRowTo(row(page, last), row(page, first))
    expect(
      (await saved).status(),
      "the drop should be one accepted write",
    ).toBe(200)

    const expected = [last, ...before.slice(0, -1)]
    await page.reload()
    await page.waitForLoadState("networkidle")
    expect(
      await shownOrder(page),
      "the order must survive a reload — a moved node is not a saved one",
    ).toEqual(expected)
    expect(
      await storedOrder(hackathonId),
      "and the backend must be the one holding it",
    ).toEqual(expected)

    // --- and back, which is the restore and a second proof ------------------
    // The moved row is at the TOP now, so the destination is whatever the
    // bottom row has become — not `last`, which is the row doing the moving.
    saved = awaitSetOrder(page)
    await dragRowTo(row(page, last), row(page, expected[expected.length - 1]!))
    expect((await saved).status()).toBe(200)

    await page.reload()
    await page.waitForLoadState("networkidle")
    expect(await shownOrder(page)).toEqual(before)
    expect(await storedOrder(hackathonId)).toEqual(before)
  })

  test("a page can be moved with the keyboard alone, and says so out loud", async ({
    page,
  }) => {
    const before = await shownOrder(page)
    expect(before.length).toBeGreaterThan(2)
    const moving = before[0]!
    const last = before.length

    const announcement = page.locator(ANNOUNCEMENT)
    // Control: the live region starts empty, so every match below is this
    // interaction's doing and not text that was on the page all along.
    await expect(announcement).toHaveText("")

    const handle = () =>
      row(page, moving).getByRole("button", {
        name: `Reorder ${moving}`,
        exact: true,
      })

    await handle().press("Enter")
    await expect(announcement).toContainText(
      `Picked up ${moving}, position 1 of ${last}`,
    )
    await expect(handle()).toHaveAttribute("aria-pressed", "true")

    const saved = awaitSetOrder(page)
    for (let i = 2; i <= last; i++) {
      await handle().press("ArrowDown")
      await expect(announcement).toContainText(
        `${moving}, position ${i} of ${last}`,
      )
    }
    await handle().press("Enter")
    await expect(announcement).toContainText(
      `Dropped ${moving} at position ${last}`,
    )
    expect((await saved).status()).toBe(200)

    const expected = [...before.slice(1), moving]
    await page.reload()
    await page.waitForLoadState("networkidle")
    expect(
      await shownOrder(page),
      "a keyboard move must persist exactly like a drag",
    ).toEqual(expected)
    expect(await storedOrder(hackathonId)).toEqual(expected)

    // --- back to the top, restoring the fixture -----------------------------
    const back = awaitSetOrder(page)
    await handle().press("Enter")
    for (let i = 0; i < last - 1; i++) await handle().press("ArrowUp")
    await handle().press("Enter")
    expect((await back).status()).toBe(200)

    await page.reload()
    await page.waitForLoadState("networkidle")
    expect(await shownOrder(page)).toEqual(before)
    expect(await storedOrder(hackathonId)).toEqual(before)
  })

  test("Escape puts a picked-up page back and writes nothing", async ({
    page,
  }) => {
    const before = await shownOrder(page)
    const moving = before[0]!
    const handle = () =>
      row(page, moving).getByRole("button", {
        name: `Reorder ${moving}`,
        exact: true,
      })

    let writes = 0
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("setOrder")) writes++
    })

    await handle().press("Enter")
    await handle().press("ArrowDown")
    // The row really did move on screen — otherwise "Escape put it back" is a
    // statement about a move that never happened.
    expect(await shownOrder(page)).toEqual([
      before[1]!,
      moving,
      ...before.slice(2),
    ])

    await handle().press("Escape")
    await expect(page.locator(ANNOUNCEMENT)).toContainText(
      "Reordering cancelled",
    )
    expect(await shownOrder(page)).toEqual(before)

    await page.waitForTimeout(500)
    expect(writes, "a cancelled move must not reach the backend").toBe(0)
    expect(await storedOrder(hackathonId)).toEqual(before)
  })
})
