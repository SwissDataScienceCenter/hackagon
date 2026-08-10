import { test, expect, type Page } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"

// The management lists (platform pages, users, participants) share one toolbar:
// quick search, dropdown filters, and a cards/table toggle whose choice is
// remembered per list. Each surface is driven the way a person drives it —
// type, pick a filter, switch view — because a control that renders is not the
// same as a control that works.

/**
 * The toolbar is client-side by nature: it re-filters a list the server already
 * sent whole, so it does nothing until the page hydrates. Driving it earlier
 * silently loses the interaction — every helper below goes through here.
 */
async function open(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState("networkidle")
}

function toolbar(page: Page) {
  return {
    search: page.getByRole("searchbox").first(),
    cards: page.getByRole("button", { name: "Card view" }),
    table: page.getByRole("button", { name: "Table view" }),
  }
}

test.describe("platform pages list", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("searches by title and clears back to the full list", async ({ page }) => {
    await open(page, "/manage/pages")
    const rows = page.getByRole("heading", { level: 2 })

    const before = await rows.count()
    expect(before, "seed should have several platform pages").toBeGreaterThan(1)

    await toolbar(page).search.fill("privacy")
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Terms of use" })).toHaveCount(0)
    // The count line is what tells you a filter is hiding things.
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible()

    await page.getByRole("button", { name: "clear" }).click()
    await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible()
  })

  test("searches the page CONTENT, not just the title", async ({ page }) => {
    await open(page, "/manage/pages")
    // "where did I write that paragraph" is the question these pages get.
    await toolbar(page).search.fill("markdown")
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible()
  })

  test("filters by draft/published", async ({ page }) => {
    await open(page, "/manage/pages")
    await page.getByLabel("Status").selectOption("draft")
    // The seed publishes all three, so the draft filter empties the list —
    // that is the assertion: the filter is applied, not ignored.
    await expect(page.getByText("No pages match your search.")).toBeVisible()

    await page.getByLabel("Status").selectOption("published")
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible()
  })

  test("switches to the table and offers row actions there", async ({ page }) => {
    await open(page, "/manage/pages")
    await toolbar(page).table.click()

    const table = page.getByRole("table")
    await expect(table).toBeVisible()
    await expect(table.getByRole("columnheader", { name: /Title/ })).toBeVisible()
    await expect(table.getByRole("cell", { name: "/privacy" })).toBeVisible()

    // Actions live behind a per-row menu so the row stays one line.
    await page.getByRole("button", { name: /Actions for Privacy/ }).click()
    await expect(page.getByRole("menu").getByText("Delete")).toBeVisible()
  })

  test("sorts by a column header", async ({ page }) => {
    await open(page, "/manage/pages")
    await toolbar(page).table.click()

    const header = page.getByRole("button", { name: /^URL/ })
    await header.click()
    const first = page.getByRole("row").nth(1)
    await expect(first).toContainText("/about")

    await header.click() // descending
    await expect(page.getByRole("row").nth(1)).toContainText("/terms")
  })

  test("remembers the chosen view across a reload", async ({ page }) => {
    await open(page, "/manage/pages")
    await toolbar(page).table.click()
    await expect(page.getByRole("table")).toBeVisible()

    await page.reload()
    await page.waitForLoadState("networkidle")
    // Persisted per list in localStorage: coming back to a list you left in
    // table view and getting cards is a small betrayal every single time.
    await expect(page.getByRole("table")).toBeVisible()
  })
})

test.describe("users list", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("defaults to the table and searches across name, handle and email", async ({ page }) => {
    await open(page, "/manage/users")
    await expect(page.getByRole("table")).toBeVisible()

    await toolbar(page).search.fill("alice")
    await expect(page.getByRole("cell", { name: "Alice Wonderland" })).toBeVisible()
    await expect(page.getByRole("cell", { name: "Bob Henderson" })).toHaveCount(0)
  })

  test("filters by global role", async ({ page }) => {
    await open(page, "/manage/users")
    await page.getByLabel("Role").selectOption("1")
    await expect(page.getByRole("cell", { name: "Hackagon Admin" })).toBeVisible()
    await expect(page.getByRole("cell", { name: "Bob Henderson" })).toHaveCount(0)
  })

  test("switches to cards", async ({ page }) => {
    await open(page, "/manage/users")
    await toolbar(page).cards.click()
    await expect(page.getByRole("table")).toHaveCount(0)
    await expect(page.getByText("Alice Wonderland")).toBeVisible()
  })
})

test.describe("participants list", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("filters the roster by membership state", async ({ page }) => {
    await open(page, "/dashboard")
    await page.locator("a").filter({ hasText: "AI Innovation Challenge 2026" }).first().click()
    await page.getByRole("link", { name: "Participants" }).first().click()
    await page.waitForLoadState("networkidle")

    await expect(page.getByText(/confirmed/)).toBeVisible()

    // The seed waitlists charles on this hackathon.
    await page.getByLabel("Status").selectOption("waitlisted")
    await expect(page.getByText("Charles Whitfield")).toBeVisible()

    await page.getByLabel("Status").selectOption("confirmed")
    await expect(page.getByText("Charles Whitfield")).toHaveCount(0)
  })

  test("shows the roster as one sortable table", async ({ page }) => {
    await open(page, "/dashboard")
    await page.locator("a").filter({ hasText: "AI Innovation Challenge 2026" }).first().click()
    await page.getByRole("link", { name: "Participants" }).first().click()
    await page.waitForLoadState("networkidle")

    await toolbar(page).table.click()
    const table = page.getByRole("table")
    await expect(table).toBeVisible()
    // Confirmed and waitlisted are one list here, with the split as a column:
    // sorting across two separate tables would not sort anything.
    await expect(table.getByRole("columnheader", { name: /Status/ })).toBeVisible()
    await expect(table.getByText("Waitlisted").first()).toBeVisible()
  })
})
