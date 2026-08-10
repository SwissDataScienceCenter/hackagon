import { test, expect } from "@playwright/test"
import { SEED_HACKATHONS } from "../../personas.js"

// Anonymous visitor: public reads work, private data is invisible, protected
// routes bounce to login. Backend authority: HackathonService.List filters
// private hackathons via casbin (the "anonymous" subject only passes wildcard
// rules), the frontend only renders what it gets.

test.describe("anonymous visitor", () => {
  test("home page renders the public hackathon list", async ({ page }) => {
    await page.goto("/")

    await expect(
      page.getByRole("heading", { name: "SDSC Hackathon Platform" }),
    ).toBeVisible()

    for (const key of ["h1", "h2"] as const) {
      const h = SEED_HACKATHONS[key]
      const row = page
        .locator('a[href^="/hackathon/"]')
        .filter({ hasText: h.name })
        .first()
      await expect(row, `${h.name} should be listed`).toBeVisible()
      await expect(
        row.getByText(h.statusBadge),
        `${h.name} should show the server-computed "${h.statusBadge}" status`,
      ).toBeVisible()
    }
  })

  test("private hackathons are not listed", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText(SEED_HACKATHONS.h3.name)).toHaveCount(0)
  })

  test("protected routes redirect to login with returnTo", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/\?returnTo=%2Fdashboard/)

    await page.goto("/my/hackathon/some-id/overview")
    await expect(page).toHaveURL(/\/\?returnTo=/)

    // Still anonymous: the NavBar offers "Log in".
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible()
  })
})
