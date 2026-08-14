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

  // Re-specified: the guard used to drop anonymous visitors on the LANDING page
  // (`/?returnTo=…`), which explained nothing and — because the "Log in" button
  // computed its own destination from the pathname — threw the parked link away.
  // It bounces to the /signin interstitial now, which says what happened and
  // hands that same value to Auth.js. See 23-login-destination.spec.ts for the
  // round trip; this asserts the 303 itself.
  test("protected routes bounce to the sign-in interstitial, carrying the destination", async ({
    page,
  }) => {
    // The REDIRECT, not the page it lands on. The interstitial sends itself to
    // the identity provider about two seconds after it renders — that is the
    // feature — so a browser parked on it is a moving target and any assertion
    // made there races the navigation. `maxRedirects: 0` asks the guard directly.
    for (const target of ["/dashboard", "/my/hackathon/some-id/overview"]) {
      const resp = await page.request.get(target, { maxRedirects: 0 })
      expect(
        resp.status(),
        `${target} should bounce an anonymous visitor`,
      ).toBe(303)
      expect(
        resp.headers()["location"],
        `${target} must be parked on the interstitial, not discarded`,
      ).toBe(`/signin?returnTo=${encodeURIComponent(target)}`)
    }

    // Still anonymous: the NavBar offers "Log in".
    await page.goto("/")
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible()
  })
})
