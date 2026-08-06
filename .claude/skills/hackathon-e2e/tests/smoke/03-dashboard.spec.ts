import { test, expect, type Page, type Locator } from "@playwright/test"
import {
  ALL_PERSONAS,
  SEED_EXPECTATIONS,
  SEED_HACKATHONS,
} from "../../personas.js"
import { storageStatePath } from "../../helpers/state.js"

// Dashboard content per persona, against the seed fixture. This encodes the
// seed's involvement matrix (cmd/seed/README.md): who is connected to what,
// with which membership badge (Owner / Member / Waitlisted from casbin +
// participant.is_waiting).

function section(page: Page, heading: string) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: heading }) })
}

// A row is a link (the hackathon itself) plus whatever the list wraps around
// it — a membership badge here, a Join form in the other section. Those live
// OUTSIDE the link, because they are not part of navigating to the hackathon,
// so anchoring on the link alone finds neither.
//
// Reached as the link's grandparent rather than by class list: `div.flex-1`
// and `div.items-center` are layout decisions and have already been rewritten
// once. The relationship "the thing the row is mounted in" survives that.
function row(scope: Locator, name: string): Locator {
  return scope
    .locator("a")
    .filter({ hasText: name })
    .first()
    .locator("xpath=../..")
}

for (const persona of ALL_PERSONAS) {
  const expected = SEED_EXPECTATIONS[persona.key]

  test.describe(`${persona.key} dashboard`, () => {
    test.use({ storageState: storageStatePath(persona.key) })

    test("shows the connected-hackathons count", async ({ page }) => {
      await page.goto("/dashboard")
      const n = expected.dashboard.connectedCount
      await expect(
        page.getByText(
          new RegExp(`connected to ${n} hackathon${n === 1 ? "\\b" : "s"}`),
        ),
      ).toBeVisible()
    })

    test("lists my hackathons with the right membership badge", async ({ page }) => {
      await page.goto("/dashboard")
      const mine = section(page, "Your hackathons")

      for (const { hackathon, badge } of expected.dashboard.mine) {
        const name = SEED_HACKATHONS[hackathon].name
        const r = row(mine, name)
        await expect(r, `${name} should be under "Your hackathons"`).toBeVisible()
        await expect(
          r.getByText(badge, { exact: true }),
          `${name} should carry the "${badge}" membership badge`,
        ).toBeVisible()
      }

      // Nothing the persona is NOT connected to may appear here.
      const mineKeys = expected.dashboard.mine.map((m) => m.hackathon)
      for (const key of ["h1", "h2", "h3"] as const) {
        if (mineKeys.includes(key)) continue
        await expect(mine.getByText(SEED_HACKATHONS[key].name)).toHaveCount(0)
      }
    })

    test("my hackathons link to the member view, not the public page", async ({ page }) => {
      await page.goto("/dashboard")
      const mine = section(page, "Your hackathons")

      for (const { hackathon } of expected.dashboard.mine) {
        const name = SEED_HACKATHONS[hackathon].name
        // Being in an event is the whole difference between the two views;
        // sending a member to the public page loses every reason they joined.
        await expect(
          mine.locator("a").filter({ hasText: name }).first(),
        ).toHaveAttribute("href", /\/my\/hackathon\/[^/]+\/overview$/)
      }
    })

    test("lists other public hackathons", async ({ page }) => {
      await page.goto("/dashboard")
      const others = section(page, "Other hackathons")

      if (expected.dashboard.others.length === 0) {
        await expect(others.getByText("No other hackathons available.")).toBeVisible()
        return
      }
      for (const key of expected.dashboard.others) {
        const name = SEED_HACKATHONS[key].name
        await expect(others.getByText(name)).toBeVisible()
        // Not-yet-joined rows offer a Join action, scoped to their OWN row —
        // a page-wide "first Join button" passes even when the wrong row has it.
        await expect(row(others, name).getByRole("button", { name: "Join" })).toBeVisible()
        // And they point at the public page: there is no member view yet.
        await expect(
          others.locator("a").filter({ hasText: name }).first(),
        ).toHaveAttribute("href", /\/hackathon\/[^/]+$/)
      }
    })
  })
}
