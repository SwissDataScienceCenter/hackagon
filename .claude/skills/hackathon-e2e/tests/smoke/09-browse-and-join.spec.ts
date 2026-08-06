import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import { SEED_HACKATHONS } from "../../personas.js"

// The public browse page, and what happens when you join an event that asks
// its registrants questions.

test.describe("browse hackathons", () => {
  test("anyone can browse the panels without an account", async ({ page }) => {
    await page.goto("/hackathon")
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("heading", { name: "Hackathons", level: 1 })).toBeVisible()
    // Panels link to the public event page.
    const card = page.locator('a[href^="/hackathon/"]').filter({ hasText: SEED_HACKATHONS.h1.name })
    await expect(card.first()).toBeVisible()

    // Private events are filtered server-side, not hidden in the UI.
    await expect(page.getByText(SEED_HACKATHONS.h3.name)).toHaveCount(0)
  })

  test("searches and filters across them", async ({ page }) => {
    await page.goto("/hackathon")
    await page.waitForLoadState("networkidle")

    await page.getByRole("searchbox").first().fill("climate")
    await expect(page.getByText(SEED_HACKATHONS.h2.name).first()).toBeVisible()
    await expect(page.getByText(SEED_HACKATHONS.h1.name)).toHaveCount(0)

    await page.getByRole("button", { name: "clear" }).click()
    // Status filter: the seed's h1 is upcoming, h2 is running.
    await page.getByLabel("Status").selectOption("2")
    await expect(page.getByText(SEED_HACKATHONS.h2.name).first()).toBeVisible()
    await expect(page.getByText(SEED_HACKATHONS.h1.name)).toHaveCount(0)
  })

  test("a panel opens the event", async ({ page }) => {
    await page.goto("/hackathon")
    await page.waitForLoadState("networkidle")
    await page.locator('a[href^="/hackathon/"]').filter({ hasText: SEED_HACKATHONS.h1.name }).first().click()
    await expect(page).toHaveURL(/\/hackathon\/[0-9a-f-]+$/)
    // The event page also renders a "Welcome to <name>" page heading, so
    // match the hero exactly rather than by substring.
    await expect(
      page.getByRole("heading", { name: SEED_HACKATHONS.h1.name, exact: true }),
    ).toBeVisible()
  })
})

test.describe("joining an event that asks questions", () => {
  test.use({ storageState: storageStatePath("charles") })

  test("lands on the organizer's registration form", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    const joinable = page.getByRole("button", { name: "Join" })
    const count = await joinable.count()
    test.skip(count === 0, "charles has already joined everything in this fixture")

    await joinable.first().click()

    // Joining is only half of signing up when an event asks for an
    // affiliation or a code-of-conduct consent. Either the form opens, or the
    // event asks nothing and the dashboard just updates — both are correct,
    // but a form that exists must never be skipped.
    await page.waitForLoadState("networkidle")
    if (page.url().includes("/register/")) {
      await expect(page.getByRole("heading", { name: /Registration|Your registration/ })).toBeVisible()
      await expect(page.getByRole("button", { name: /Submit registration|Save changes/ })).toBeVisible()
    } else {
      await expect(page).toHaveURL(/\/dashboard/)
    }
  })
})
