import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"

// Granting and revoking a global role from /manage/users.
//
// This page has shipped calling AddRole/RemoveRole while both were
// Unimplemented stubs on the backend — its error handler catches
// PERMISSION_DENIED / NOT_FOUND / INVALID_ARGUMENT and lets anything else
// through, so every click rendered a 500. Nothing tested it because nothing
// had ever pressed the button.

test.describe("global roles", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("an admin can promote and demote a member", async ({ page }) => {
    await page.goto("/manage/users")
    await page.waitForLoadState("networkidle")

    const row = page.locator("tr").filter({ hasText: "Bob Henderson" })
    await expect(row).toBeVisible()

    // Grant. The control is either a single "Grant <role>" button or a picker,
    // depending on how many roles the person is missing.
    const grant = row.getByRole("button", { name: /Grant/ })
    const picker = row.locator("select[name=role]")
    if (await picker.count()) {
      await picker.selectOption("2") // Hackathon Organizer
    }
    await grant.click()
    await page.waitForLoadState("networkidle")

    await expect(
      page.locator("tr").filter({ hasText: "Bob Henderson" }).locator(".badge"),
      "the granted role should show as a badge on his row",
    ).toContainText(/Organizer/i)

    // And take it away again.
    const after = page.locator("tr").filter({ hasText: "Bob Henderson" })
    await after.getByRole("button", { name: /Revoke|Remove/ }).first().click()
    await page.waitForLoadState("networkidle")
    // The BADGE, not the row: the row also holds the grant picker, whose
    // options are named after the very roles being asserted about. Twice now
    // that has made a row-level assertion say what the tester hoped rather
    // than what the page shows.
    await expect(
      page.locator("tr").filter({ hasText: "Bob Henderson" }).locator(".badge"),
    ).toHaveCount(0)
  })

  test("an admin is not offered a control to demote themselves", async ({
    page,
  }) => {
    await page.goto("/manage/users")
    await page.waitForLoadState("networkidle")

    // Admin is the only role that can grant Admin, so the last one to do this
    // would lock every admin task out of the platform. The backend refuses it
    // unconditionally and the page hides the control, so this asserts absence.
    //
    // It used to click the control and expect the error, with a `test.skip`
    // when none rendered — which is the ONLY path it ever took, so it reported
    // green while proving nothing. An assertion that opts out when the thing it
    // needs is missing is not a test.
    const mine = page.locator("tr").filter({ hasText: "Hackagon Admin" })
    await expect(mine.first()).toBeVisible()
    await expect(
      mine.getByRole("button", { name: "Revoke Admin" }),
      "own-Admin revoke is hidden, not merely disabled",
    ).toHaveCount(0)

    // Someone ELSE's row does offer one, so the absence above is about self and
    // not about the control having quietly disappeared for everybody.
    const other = page.locator("tr").filter({ hasText: "Bob Henderson" })
    const picker = other.locator("select[name=role]")
    if (await picker.count()) await picker.selectOption("2")
    await other.getByRole("button", { name: /Grant/ }).click()
    await page.waitForLoadState("networkidle")

    const granted = page.locator("tr").filter({ hasText: "Bob Henderson" })
    await expect(
      granted.getByRole("button", { name: /^Revoke/ }),
    ).toHaveCount(1)

    // Leave the fixture as we found it.
    await granted.getByRole("button", { name: /^Revoke/ }).click()
    await page.waitForLoadState("networkidle")
  })
})
