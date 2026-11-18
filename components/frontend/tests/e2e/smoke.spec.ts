import { expect, test } from "@playwright/test"
import { storageState } from "./paths"

// Read-only on purpose: they hold on a freshly seeded stack (CI) and on a local
// one that has aged and been clicked through, so they can run again and again.
// Hackathon names come from the seed, see components/backend/cmd/seed/README.md.

test.describe("signed out", () => {
  test("a protected page sends you to the landing page", async ({ page }) => {
    await page.goto("/dashboard")

    await expect(page).toHaveURL(/\/\?returnTo=%2Fdashboard$/)
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible()
  })

  test("the about page is public", async ({ page }) => {
    const response = await page.goto("/about")

    expect(response?.status()).toBe(200)
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible()
  })
})

test.describe("alice, an organizer", () => {
  test.use({ storageState: storageState("alice") })

  test("sees the hackathon she organizes and can create one", async ({
    page,
  }) => {
    await page.goto("/dashboard")

    const yours = page.locator("section", {
      has: page.getByRole("heading", { name: "Your hackathons" }),
    })
    await expect(yours.getByText("AI Innovation Challenge 2026")).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Create Hackathon" }),
    ).toBeVisible()
  })
})

test.describe("bob, a participant", () => {
  test.use({ storageState: storageState("bob") })

  // H3 and not H5, though bob is in neither after a seed: redeeming H5's
  // invitation as bob is one of the documented manual tests, so a local stack
  // may legitimately have him in it.
  test("does not see a private hackathon he is not in", async ({ page }) => {
    await page.goto("/dashboard")

    await expect(
      page.getByRole("heading", { name: "Your hackathons" }),
    ).toBeVisible()
    await expect(page.getByText("Internal Product Sprint")).toHaveCount(0)
  })

  test("is not offered to create a hackathon", async ({ page }) => {
    await page.goto("/dashboard")

    await expect(
      page.getByRole("heading", { name: "Your hackathons" }),
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Create Hackathon" }),
    ).toHaveCount(0)
  })
})
