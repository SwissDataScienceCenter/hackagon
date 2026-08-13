import { test, expect } from "@playwright/test"
import { ALL_PERSONAS } from "../../personas.js"
import { storageStatePath } from "../../helpers/state.js"

// Every persona has a working session (established in auth.setup.ts), and the
// public shell stays reachable while signed in.
//
// Sign-out moved: it is a top-bar button in this design, not an item inside an
// avatar menu, and it is covered by 07-account-menu.spec.ts along with the rest
// of the "about you" chrome.

for (const persona of ALL_PERSONAS) {
  test.describe(`${persona.key} session`, () => {
    test.use({ storageState: storageStatePath(persona.key) })

    test(`is signed in and can reach the dashboard`, async ({ page }) => {
      // "/" is the PUBLIC landing page and stays reachable while signed in. It
      // used to bounce members to the dashboard, which made the platform's own
      // front page unreachable once you had an account.
      await page.goto("/")
      await expect(page).toHaveURL(/(localhost:8081|trycloudflare\.com)\/$/)

      // Identity is a monogram, not a button — see helpers/login.ts.
      await expect(
        page.locator("header").getByText(persona.initial, { exact: true }),
      ).toBeVisible()

      await page.goto("/dashboard")
      await expect(
        page.getByRole("heading", { name: /Welcome back/ }),
      ).toBeVisible()
    })

    test(`the public shell links to the hackathon list and About`, async ({
      page,
    }) => {
      await page.goto("/")
      // The footer is a <nav> too — scope to the header.
      const nav = page.locator("header").getByRole("navigation").first()

      // There is no separate "Home" entry: the logo is the platform instance
      // and doubles as home, which is why it was dropped rather than added.
      await expect(
        nav.getByRole("link", { name: "Hackathons", exact: true }),
      ).toHaveAttribute("href", "/hackathon")
      await expect(
        nav.getByRole("link", { name: "About", exact: true }),
      ).toHaveAttribute("href", "/about")

      // Your own events are a SEPARATE entry, not the same word pointing
      // somewhere else once you sign in: "Hackathons" named a list and reached
      // the dashboard, so the browse page was unreachable from the chrome for
      // exactly the people who had an account.
      await expect(
        nav.getByRole("link", { name: "Dashboard", exact: true }),
      ).toHaveAttribute("href", /\/dashboard$/)

      // The logo goes home for everyone, signed in or not.
      await expect(
        page.locator("header").locator('a[href="/"]').first(),
      ).toBeVisible()
    })

    test(`the nav keeps its shape inside the app`, async ({ page }) => {
      await page.goto("/dashboard")
      const nav = page.locator("header").getByRole("navigation").first()

      // Re-specified: About used to be hidden inside the app shell as a
      // "marketing link", so the nav had three entries on the way in and two
      // once you arrived — it changed shape under you. Every entry is present
      // on every page now, which is the whole point of a top nav.
      for (const [label, href] of [
        ["Dashboard", /\/dashboard$/],
        ["Hackathons", /\/hackathon$/],
        ["About", /\/about$/],
      ] as const) {
        await expect(
          nav.getByRole("link", { name: label, exact: true }),
        ).toHaveAttribute("href", href)
      }
    })
  })
}
