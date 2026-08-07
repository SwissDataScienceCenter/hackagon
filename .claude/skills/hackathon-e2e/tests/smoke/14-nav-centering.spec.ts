import { test, expect, type Page } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"

// The primary nav must sit in the middle of the bar whether or not you are
// signed in.
//
// It used to be a three-child flexbox with justify-between, which centres the
// middle child only when the two outer children happen to be the same width.
// They never are once you sign in: the right side gains a monogram, a display
// name and a sign-out control, so the nav visibly slid left the moment you
// logged in. It is a 3-column grid now (1fr auto 1fr), which centres on the
// VIEWPORT regardless of what either side holds.
//
// Asserted as geometry, not as a class name: a class assertion would pass for
// a grid that had been restyled back into a shifted layout.

const TOLERANCE = 24 // px — half a character of drift is not a bug

async function navOffset(page: Page): Promise<number> {
  const nav = page.locator("header nav").first()
  await expect(nav).toBeVisible()
  const box = await nav.boundingBox()
  const width = page.viewportSize()!.width
  if (!box) throw new Error("nav has no bounding box")
  const navCentre = box.x + box.width / 2
  return navCentre - width / 2
}

test.describe("nav centering", () => {
  test("is centred for a signed-out visitor", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    expect(Math.abs(await navOffset(page))).toBeLessThanOrEqual(TOLERANCE)
  })

  test.describe("signed in", () => {
    test.use({ storageState: storageStatePath("bob") })

    test("is still centred once the right side gains a name and sign-out", async ({
      page,
    }) => {
      await page.goto("/dashboard")
      await page.waitForLoadState("networkidle")

      // The condition that used to break it: a non-empty right-hand group.
      // The control says "Log out", not "Sign out" — asserting the precondition
      // rather than assuming it is what turned that into one clear failure
      // instead of a centred-looking pass on a signed-OUT bar.
      await expect(
        page.getByRole("button", { name: /log ?out/i }).first(),
        "this test is only meaningful while the signed-in bar is wider on the right",
      ).toBeVisible()

      expect(Math.abs(await navOffset(page))).toBeLessThanOrEqual(TOLERANCE)
    })
  })
})
