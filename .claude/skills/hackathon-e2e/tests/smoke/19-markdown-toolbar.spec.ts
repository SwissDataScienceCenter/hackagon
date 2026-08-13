import { test, expect, type Locator, type Page } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"

// The markdown editor's formatting toolbar and its paste-a-table panel, driven
// through the real component in a real browser.
//
// The transformations themselves are pure functions with unit tests
// (`src/lib/utils/markdownEdit.ts`, `markdownTable.ts`) and the component has
// its own jsdom suite (`MarkdownEditor.test.ts`) that already renders the
// Preview pane. What only Firefox can answer is whether a real MOUSE CLICK on a
// real toolbar reaches the selection the textarea is holding, and whether marked
// + DOMPurify in the browser produce the same table the server-side render does.
//
// Nothing here submits a form, so the shared seeded database is untouched.
//
// ⚠ Every button lookup is EXACT. `getByRole("button", {name})` is substring
// AND case-insensitive by default, and this toolbar is twelve short names:
// "Insert table" would also match "Insert image", and a bare "Code" matches
// both "Inline code" and "Code block".
//
// The surface is /hackathons/create rather than a hackathon's page editor — the
// same component, but no HackathonSidebar. That sidebar is viewport-anchored
// chrome under active work, and while it was briefly `md:fixed` it covered this
// toolbar and every click here failed on "aside subtree intercepts pointer
// events". A spec for a shared form component should not be a second assertion
// about somebody else's layout.

const exactButton = (scope: Page | Locator, name: string) =>
  scope.getByRole("button", { name, exact: true })

const EDITOR_URL = "/hackathons/create"

/** Put the selection where a mouse drag would leave it. `fill()` leaves focus
 *  in the field, and the toolbar buttons suppress their own focus change, so
 *  the selection survives the click. */
async function select(area: Locator, from: number, to: number) {
  await area.evaluate(
    (el, [start, end]) => {
      const field = el as HTMLTextAreaElement
      field.focus()
      field.setSelectionRange(start, end)
    },
    [from, to],
  )
}

const caretAt = (area: Locator) =>
  area.evaluate((el) => (el as HTMLTextAreaElement).selectionStart)

const selectedText = (area: Locator) =>
  area.evaluate((el) => {
    const field = el as HTMLTextAreaElement
    return field.value.slice(field.selectionStart, field.selectionEnd)
  })

test.describe("markdown editor: formatting toolbar", () => {
  // Global Admin, which /hackathons/create requires (an organizer would do too).
  test.use({ storageState: storageStatePath("admin") })

  test.beforeEach(async ({ page }) => {
    await page.goto(EDITOR_URL)
    await page.waitForLoadState("networkidle")
    await expect(page.locator("textarea[name=description]")).toBeVisible()
  })

  test("the toolbar is present, labelled, and one tab stop with arrow keys", async ({
    page,
  }) => {
    const toolbar = page.getByRole("toolbar", { name: "Formatting" })
    await expect(toolbar).toBeVisible()

    for (const name of [
      "Bold",
      "Italic",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Link",
      "Bulleted list",
      "Numbered list",
      "Quote",
      "Inline code",
      "Code block",
      "Paste a table",
    ]) {
      await expect(exactButton(toolbar, name)).toHaveCount(1)
    }

    // Roving tabindex: exactly one button is tabbable, the rest are reached
    // with the arrow keys. Twelve buttons between the label and the field would
    // otherwise be twelve stops on the way to typing.
    await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(1)
    await expect(toolbar.locator('button[tabindex="-1"]')).toHaveCount(11)

    await exactButton(toolbar, "Bold").focus()
    await page.keyboard.press("ArrowRight")
    await expect(exactButton(toolbar, "Italic")).toBeFocused()
    await page.keyboard.press("End")
    await expect(exactButton(toolbar, "Paste a table")).toBeFocused()
    await page.keyboard.press("Home")
    await expect(exactButton(toolbar, "Bold")).toBeFocused()
  })

  test("bold wraps a selection, keeps it, and unwraps on a second press", async ({
    page,
  }) => {
    const area = page.locator("textarea[name=description]")
    await area.fill("hello world")
    await select(area, 6, 11)

    await exactButton(page, "Bold").click()

    await expect(area).toHaveValue("hello **world**")
    // The selection lands on the words, not on the asterisks, so pressing
    // again toggles the same text instead of nesting.
    expect(await selectedText(area)).toBe("world")

    await exactButton(page, "Bold").click()
    await expect(area).toHaveValue("hello world")
  })

  test("bold at an empty caret opens a pair and sits inside it", async ({
    page,
  }) => {
    const area = page.locator("textarea[name=description]")
    await area.fill("")
    await select(area, 0, 0)

    await exactButton(page, "Bold").click()

    await expect(area).toHaveValue("****")
    expect(await caretAt(area)).toBe(2)
  })

  test("headings and lists apply per line", async ({ page }) => {
    const area = page.locator("textarea[name=description]")

    await area.fill("Title")
    await select(area, 2, 2)
    await exactButton(page, "Heading 2").click()
    await expect(area).toHaveValue("## Title")

    // Re-levels rather than stacking hashes.
    await exactButton(page, "Heading 3").click()
    await expect(area).toHaveValue("### Title")

    await area.fill("one\ntwo\nthree")
    await select(area, 0, 13)
    await exactButton(page, "Numbered list").click()
    await expect(area).toHaveValue("1. one\n2. two\n3. three")

    // The two list buttons are one family: this converts, it does not nest.
    await exactButton(page, "Bulleted list").click()
    await expect(area).toHaveValue("- one\n- two\n- three")
  })

  test("Ctrl+B, Ctrl+I and Ctrl+K work from the keyboard alone", async ({
    page,
  }) => {
    const area = page.locator("textarea[name=description]")

    await area.fill("hi")
    await area.press("Control+a")
    await area.press("Control+b")
    await expect(area).toHaveValue("**hi**")

    await area.fill("hi")
    await area.press("Control+a")
    await area.press("Control+i")
    await expect(area).toHaveValue("*hi*")

    await area.fill("docs")
    await area.press("Control+a")
    await area.press("Control+k")
    await expect(area).toHaveValue("[docs](url)")
    // The URL is what is missing, so that is what is selected to type over.
    expect(await selectedText(area)).toBe("url")
  })
})

test.describe("markdown editor: paste a table", () => {
  test.use({ storageState: storageStatePath("admin") })

  test.beforeEach(async ({ page }) => {
    await page.goto(EDITOR_URL)
    await page.waitForLoadState("networkidle")
    await expect(page.locator("textarea[name=description]")).toBeVisible()
  })

  const openPanel = async (page: Page) => {
    await exactButton(page, "Paste a table").click()
    const panel = page.getByRole("group", { name: "Paste a table" })
    await expect(panel).toBeVisible()
    return panel
  }

  test("a spreadsheet paste becomes a table the preview really renders", async ({
    page,
  }) => {
    const area = page.locator("textarea[name=description]")
    const panel = await openPanel(page)

    // Tab-separated, which is what a spreadsheet selection puts on the
    // clipboard. One cell carries a literal pipe: unescaped, it would end that
    // cell and shift every column after it — silently, in the middle of the
    // data.
    await panel
      .locator("textarea")
      .fill("Track\tLead\nClimate\tAlice\na|b\tBob")

    // The shape is read back BEFORE inserting: "it inserted something" and "it
    // found two columns" are different claims.
    await expect(panel).toContainText("2 columns × 2 rows")
    await expect(panel).toContainText("separated by tab")

    await exactButton(panel, "Insert table").click()
    await expect(panel).toBeHidden()

    // Cells are padded to the column width — the raw markdown has to stay
    // readable, because the textarea is the source of truth — so the exact run
    // of spaces is not what is asserted here.
    await expect(area).toHaveValue(/\| Track\s+\| Lead\s+\|/)
    // The pipe left as data would have produced `| a|b | Bob |`.
    await expect(area).toHaveValue(/\| a\\\|b\s+\| Bob\s+\|/)

    // …and the end of the chain: what the reader sees.
    await exactButton(page, "Preview").click()
    const table = page.locator(".markdown-content table")
    await expect(table).toBeVisible()
    await expect(table.locator("thead th")).toHaveCount(2)
    await expect(table.locator("tbody tr")).toHaveCount(2)
    await expect(table.locator("tbody tr").nth(0).locator("td")).toHaveCount(2)
    await expect(table.locator("thead th").nth(0)).toHaveText("Track")
    // One cell, not two: the escape held through marked and DOMPurify.
    await expect(
      table.locator("tbody tr").nth(1).locator("td").nth(0),
    ).toHaveText("a|b")
  })

  test("CSV works, and a quoted comma stays inside its cell", async ({
    page,
  }) => {
    const area = page.locator("textarea[name=description]")
    const panel = await openPanel(page)

    await panel.locator("textarea").fill('City,Country\n"Lausanne, VD",CH')

    await expect(panel).toContainText("2 columns × 1 row")
    await expect(panel).toContainText("separated by comma")

    await exactButton(panel, "Insert table").click()
    await expect(area).toHaveValue(/Lausanne, VD/)

    await exactButton(page, "Preview").click()
    const cells = page.locator(".markdown-content tbody td")
    await expect(cells).toHaveCount(2)
    await expect(cells.nth(0)).toHaveText("Lausanne, VD")
  })

  test("an ambiguous separator is flagged and can be overruled", async ({
    page,
  }) => {
    const panel = await openPanel(page)

    // European CSV: `;` between fields, `,` as the decimal mark. Splitting on
    // either yields a consistent grid, so the person has to choose.
    await panel.locator("textarea").fill("1,5;2,5\n3,5;4,5")
    await expect(panel).toContainText("More than one separator fits")

    await panel.getByLabel("Separator").selectOption(",")
    await expect(panel).toContainText("3 columns × 1 row")
    await expect(panel).not.toContainText("More than one separator fits")

    await panel.getByLabel("Separator").selectOption(";")
    await expect(panel).toContainText("2 columns × 1 row")
  })

  test("data with no header row gets an empty header, keeping every row", async ({
    page,
  }) => {
    const panel = await openPanel(page)
    await panel.locator("textarea").fill("Alice\tOrganizer\nBob\tParticipant")
    await expect(panel).toContainText("2 columns × 1 row")

    await panel.getByLabel("First row is a header").uncheck()
    await expect(panel).toContainText("2 columns × 2 rows")

    await exactButton(panel, "Insert table").click()
    await exactButton(page, "Preview").click()

    const table = page.locator(".markdown-content table")
    await expect(table.locator("tbody tr")).toHaveCount(2)
    await expect(table.locator("thead th").nth(0)).toHaveText("")
  })

  test("the panel refuses to insert nothing, and Escape closes it", async ({
    page,
  }) => {
    const panel = await openPanel(page)

    await expect(panel).toContainText("Nothing pasted yet.")
    await expect(exactButton(panel, "Insert table")).toBeDisabled()

    await page.keyboard.press("Escape")
    await expect(panel).toBeHidden()
    // Focus goes back to the control that opened it, not to the top of the page.
    await expect(exactButton(page, "Paste a table")).toBeFocused()
  })
})
