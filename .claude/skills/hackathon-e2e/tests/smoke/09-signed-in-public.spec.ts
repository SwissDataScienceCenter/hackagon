import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"

// The PUBLIC pages, visited by someone who is SIGNED IN.
//
// This combination had no coverage at all, and it is its own hazard:
// `hooks.server.ts` creates `locals.grpc` only for PROTECTED routes, so a
// public loader that reaches for it works for every anonymous visitor and
// throws a 500 for every logged-in one. That is exactly what shipped — the
// event page 500'd for anyone who followed a link while logged in, and every
// anonymous check in the suite passed.
//
// Anything public that a member can also reach belongs here.

test.describe("public pages while signed in", () => {
  test.use({ storageState: storageStatePath("alice") })

  test("no route in the public shell answers 5xx", async ({ page }) => {
    const failures: string[] = []
    page.on("response", (r) => {
      if (r.status() >= 500) failures.push(`${r.status()} ${r.url()}`)
    })

    await page.goto("/")
    await page.goto("/hackathon")
    await page.waitForLoadState("networkidle")

    // Into the first event the browse page offers — the click a member makes
    // when a colleague sends them a link.
    const first = page.locator('main a[href*="/hackathon/"]').first()
    if (await first.count()) {
      await first.click()
      await page.waitForURL(/\/hackathon\/[0-9a-f-]{36}/, { timeout: 15_000 })
    }
    await page.goto("/about")
    await page.waitForLoadState("networkidle")

    expect(failures, `server errors:\n${failures.join("\n")}`).toEqual([])
  })

  test("the nav still offers Dashboard from a public page", async ({
    page,
  }) => {
    await page.goto("/hackathon")
    const nav = page.locator("header").getByRole("navigation").first()

    // The public shell renders the same NavBar; a member on it must be able to
    // get back to their own events without editing the URL.
    await expect(
      nav.getByRole("link", { name: "Dashboard", exact: true }),
    ).toBeVisible()
    await nav.getByRole("link", { name: "Dashboard", exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test("an event page offers the member their own view", async ({ page }) => {
    await page.goto("/dashboard")
    const mine = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Your hackathons" }) })
      .locator('a[href*="/my/hackathon/"]')
      .first()
    test.skip((await mine.count()) === 0, "alice is in no hackathon here")

    const id = (await mine.getAttribute("href"))!.split("/")[3]
    await page.goto(`/hackathon/${id}`)

    // Not "Join": she is already in. The call to action is the one thing on
    // this page that depends on who is reading it.
    await expect(
      page.getByRole("link", { name: "Open your event view" }),
    ).toBeVisible()
  })
})
