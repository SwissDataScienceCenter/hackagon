import { test, expect, type Page } from "@playwright/test"
import { ALL_PERSONAS, PERSONAS } from "../../personas.js"
import { storageStatePath } from "../../helpers/state.js"

// Reaching your own account, and signing out.
//
// This replaces the avatar-dropdown spec. That menu does not exist in this
// design: identity is a monogram <span> ("identity, not an action to be drawn
// toward"), and the things you can do about yourself — account, sign out — are
// controls in the top bar rather than items behind a disclosure.
//
// What is still worth pinning is the property the old spec existed for: every
// destination that concerns YOU is reachable from the chrome. /account backs
// EditProfile and account deletion and nothing else links to it, so an
// unreachable link means a dead feature — which is exactly what happened when
// the account link was first added to AppSidebar, a component no route mounts.

function header(page: Page) {
  return page.locator("header")
}

test.describe("account, from the top bar", () => {
  test.use({ storageState: storageStatePath("alice") })

  test("the header identifies who is signed in", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(
      header(page).getByText(PERSONAS.alice.initial, { exact: true }),
    ).toBeVisible()
  })

  test("the account link reaches the account page", async ({ page }) => {
    await page.goto("/dashboard")
    // By its accessible name, not its position: it is an icon control on
    // desktop and a labelled row on phones, and both must work.
    await header(page)
      .getByRole("link", { name: "Your account" })
      .first()
      .click()

    await expect(page).toHaveURL(/\/account$/)
    await expect(
      page.getByRole("heading", { name: "Your account" }),
    ).toBeVisible()
  })

  test("the account page offers the profile edit and the deletion path", async ({
    page,
  }) => {
    await page.goto("/account")

    // The two things only this page can do.
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible()
    await expect(
      page.getByRole("button", { name: /Delete my profile/ }),
    ).toBeVisible()
  })

  test("username and email link out to the identity provider", async ({
    page,
  }) => {
    await page.goto("/account")

    // Keycloak owns them and re-reads them from the token on every request, so
    // editing them here would be undone on the next page load. The page has to
    // send you where the change actually sticks.
    const out = page.getByRole("link", { name: /Change them there/ })
    await expect(out).toBeVisible()
    await expect(out).toHaveAttribute("href", /\/realms\/hackagon\/account$/)
  })
})

test.describe("sign out", () => {
  test.use({ storageState: storageStatePath(PERSONAS.bob.key) })

  test("returns to the public shell", async ({ page }) => {
    await page.goto("/dashboard")
    // signOut() is a client call, so this one genuinely needs hydration.
    await page.waitForLoadState("networkidle")

    await header(page).getByRole("button", { name: "Log out" }).first().click()

    await page.waitForURL(/localhost:8081\/($|\?)/, { timeout: 15_000 })
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible()

    // And the session is really gone, not just visually. Asked as the 303 the
    // guard answers with, not by landing on it: the /signin interstitial sends
    // itself to Keycloak a couple of seconds after it renders, so a browser
    // parked there is mid-navigation by the time an assertion runs. The
    // redirect is also the stronger claim — it is the SERVER refusing, where a
    // rendered page could be a cached one.
    const resp = await page.request.get("/dashboard", { maxRedirects: 0 })
    expect(resp.status()).toBe(303)
    expect(resp.headers()["location"]).toBe("/signin?returnTo=%2Fdashboard")
  })
})

test.describe("every persona can reach their account", () => {
  // The regression this guards: a link that exists in a component no route
  // renders. Cheap to check per persona, and it is the whole point of the page.
  for (const persona of ALL_PERSONAS) {
    test(`${persona.key}`, async ({ page, browser }) => {
      const ctx = await browser.newContext({
        storageState: storageStatePath(persona.key),
      })
      const p = await ctx.newPage()
      await p.goto("/account")
      await expect(
        p.getByRole("heading", { name: "Your account" }),
      ).toBeVisible()
      await ctx.close()
      void page
    })
  }
})
