import { expect, test as setup } from "@playwright/test"
import { password, storageState, users } from "./paths"

// Logs in once per user through the real Keycloak form and saves the session,
// so every test starts signed in without going through the form again.
for (const user of users) {
  setup(`log in as ${user}`, async ({ page }) => {
    await page.goto("/")

    // Keycloak's page, not ours, so its stable element ids are the contract.
    const username = page.locator("#username")

    // The button is server-rendered and only works once Svelte has hydrated
    // it, so a click that lands earlier does nothing. Click until Keycloak
    // answers, but not again once it has.
    await expect(async () => {
      if (!(await username.isVisible())) {
        await page
          .getByRole("button", { name: "Log in" })
          .click({ timeout: 2_000 })
      }
      await expect(username).toBeVisible({ timeout: 5_000 })
    }).toPass()

    // The realm asks for the username and the password on separate pages.
    await username.fill(user)
    await page.locator("#kc-login").click()
    await page.locator("#password").fill(password)
    await page.locator("#kc-login").click()

    await expect(page).toHaveURL(/\/dashboard$/)
    await page.context().storageState({ path: storageState(user) })
  })
}
