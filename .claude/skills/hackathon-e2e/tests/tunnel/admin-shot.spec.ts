import { test } from "@playwright/test"
import { PERSONAS, SEED_HACKATHONS } from "../../personas.js"
import { storageStatePath } from "../../helpers/state.js"
import { myHackathonId } from "../../helpers/discover.js"

/**
 * Screenshot utility, not a test: captures the ORGANIZER surfaces at desktop
 * width into .artifacts/admin/, so the management UI can be reviewed without
 * driving the app by hand.
 *
 * Runs only with ADMIN_SHOT=1:
 *   ADMIN_SHOT=1 pnpm exec playwright test --project=tunnel --grep "admin panel"
 *
 * Needs the seeded fixture (scripts/run.sh smoke leaves it in place).
 */
const enabled = !!process.env.ADMIN_SHOT

test.describe("admin panel screenshots", () => {
  test.skip(!enabled, "ADMIN_SHOT not set — utility spec, skipped in suites")
  test.use({
    storageState: storageStatePath(PERSONAS.admin.key),
    viewport: { width: 1440, height: 900 },
  })

  test("organizer surfaces", async ({ page }) => {
    // H2 is the one hackagon-admin owns in the seed fixture.
    const id = await myHackathonId(page, SEED_HACKATHONS.h2.name)

    const shots: { name: string; path: string }[] = [
      // The one-page organiser cockpit is gone: this design gives each of its
      // sections a route, so the shot list follows them rather than a URL that
      // no longer resolves.
      { name: "01-edit", path: `/my/hackathon/${id}/edit` },
      { name: "02-projects", path: `/my/hackathon/${id}/projects` },
      { name: "03-teams", path: `/my/hackathon/${id}/teams` },
      { name: "04-voting", path: `/my/hackathon/${id}/voting` },
      { name: "05-participants", path: `/my/hackathon/${id}/participants` },
      { name: "06-submissions", path: `/my/hackathon/${id}/submissions` },
      { name: "07-create-hackathon", path: "/hackathons/create" },
      { name: "08-platform-pages", path: "/manage/pages" },
      { name: "09-windows", path: `/my/hackathon/${id}/windows` },
      { name: "10-forms", path: `/my/hackathon/${id}/forms` },
      { name: "11-email", path: `/my/hackathon/${id}/email` },
      { name: "12-prizes", path: `/my/hackathon/${id}/prizes` },
      { name: "13-invites", path: `/my/hackathon/${id}/invites` },
    ]

    for (const s of shots) {
      await page.goto(s.path)
      await page.waitForLoadState("networkidle")
      await page.screenshot({ path: `.artifacts/admin/${s.name}.png`, fullPage: true })
    }

    // The account menu only exists once opened, so it needs its own shot.
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")
    await page
      .locator("header")
      .getByRole("button", { name: PERSONAS.admin.initial, exact: true })
      .click()
    await page.screenshot({ path: ".artifacts/admin/09-account-menu.png" })
  })
})
