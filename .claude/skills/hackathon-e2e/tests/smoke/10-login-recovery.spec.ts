import { test, expect } from "@playwright/test"

// Getting back out of the password step.
//
// Keycloak's identity-first flow asks for the username, then shows a SECOND
// page with that username greyed out and the password field below. If you
// mistyped the username there is exactly one way back — and it shipped as a
// bare ↻ glyph whose only label was a hover tooltip, so people did not
// recognise it and reported being stuck on the wrong account.

test.describe("password step: changing the username", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("offers a labelled way back that actually restarts the login", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "Log in" }).click()
    await page.waitForURL(/\/realms\/hackagon\//, { timeout: 45_000 })

    // Identity-first: username, then the password page.
    await page.locator("#username").fill("wrong-person")
    if (!(await page.locator("#password").isVisible())) {
      await page.locator("#kc-login").click()
      await page.locator("#password").waitFor({ timeout: 20_000 })
    }

    const back = page.locator("#reset-login")
    await expect(back).toBeVisible()
    // A word, not just an icon: this is the whole point of the fix. The text
    // comes from CSS (the theme extends keycloak.v2 without copying its
    // templates), so it is asserted through the rendered pseudo-element.
    const label = await back.evaluate(
      (e) => getComputedStyle(e, "::before").content,
    )
    expect(label).toContain("Change")
    // It must sit inside the button, not float over the icon — PatternFly owns
    // ::after on buttons for its border overlay, and a label put there escaped.
    const fits = await back.evaluate((e) => {
      const r = e.getBoundingClientRect()

      return r.width > 60 && r.height > 20
    })
    expect(fits, "the labelled control should size to its text").toBe(true)

    await back.click()
    // Back to a fresh username prompt, nothing carried over.
    await expect(page.locator("#username")).toBeEditable()
    await expect(page.locator("#password")).toHaveCount(0)
  })
})
