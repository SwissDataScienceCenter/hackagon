import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"

test.use({ storageState: storageStatePath("alice") })

test("the platform profile saves and survives the next request", async ({ page }) => {
  await page.goto("/account")
  await page.getByLabel("Affiliation").fill("ETH Zurich")
  await page.getByLabel("Skills").fill("Python, ML")
  await page.getByLabel("Dietary requirements").fill("vegetarian")
  await page.getByLabel("Profile picture").fill("https://example.org/me.png")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Saved.")).toBeVisible()

  // The real test: WhoAmI runs on every protected page, and it used to re-sync
  // profile fields from the token — which silently reverted any edit.
  await page.goto("/dashboard")
  await page.goto("/account")
  await expect(page.getByLabel("Affiliation")).toHaveValue("ETH Zurich")
  await expect(page.getByLabel("Dietary requirements")).toHaveValue("vegetarian")

  // Clearing must stick too — a min_len would have made this impossible.
  await page.getByLabel("Dietary requirements").fill("")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Saved.")).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Dietary requirements")).toHaveValue("")

  // And a javascript: avatar is refused rather than stored.
  await page.getByLabel("Profile picture").fill("javascript:alert(1)")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText(/http/)
})
