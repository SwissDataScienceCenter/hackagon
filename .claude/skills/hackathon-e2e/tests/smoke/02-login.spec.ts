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
      await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible()
    })

    // ⚠ Re-specified 2026-08-14 for develop's `143a9612`. The header nav is TWO
    // entries now — Dashboard and "All Hackathons" — and About has been dropped
    // from it: the page stays, the entry does not. "Hackathons" was renamed
    // because the wordmark to its left already reads Hackathons, so the bare
    // noun appeared twice in one row, once as the platform and once as a page
    // inside it.
    //
    // The PROPERTY these two tests were written for is untouched and is still
    // what they assert: one meaning per entry, and the same set of entries on
    // both sides of the login. Only the membership of that set moved.
    const NAV_ENTRIES = [
      ["Dashboard", /\/dashboard$/],
      ["All Hackathons", /\/hackathon$/],
    ] as const

    test(`the public shell links to the hackathon list and the dashboard`, async ({
      page,
    }) => {
      await page.goto("/")
      // The footer is a <nav> too — scope to the header.
      const nav = page.locator("header").getByRole("navigation").first()

      // There is no separate "Home" entry: the logo is the platform instance
      // and doubles as home, which is why it was dropped rather than added.
      //
      // Your own events are a SEPARATE entry from everyone's, not the same word
      // pointing somewhere else once you sign in: "Hackathons" named a list and
      // reached the dashboard, so the browse page was unreachable from the
      // chrome for exactly the people who had an account. The label states the
      // scope now, which is the third fix to the same confusion.
      for (const [label, href] of NAV_ENTRIES) {
        await expect(
          nav.getByRole("link", { name: label, exact: true }),
          `the header nav has no "${label}" entry`,
        ).toHaveAttribute("href", href)
      }

      // About left the header and did NOT leave the product: it is a SitePage
      // and the footer is its way in. Asserted positively, because "no About in
      // the header" is satisfied just as well by an About that was deleted, and
      // an absence with no positive control agrees with everything
      // (.claude/CLAUDE.md, "Ways a test reported green while proving nothing").
      await expect(
        nav.getByRole("link", { name: "About", exact: true }),
        "About is deliberately not a header entry any more",
      ).toHaveCount(0)
      await expect(
        page
          .locator("footer")
          .getByRole("navigation", { name: "Platform" })
          .getByRole("link", { name: "About", exact: true }),
        "…but it must still be reachable, and the footer is now the only way in",
      ).toHaveAttribute("href", "/about")

      // The logo goes home for everyone, signed in or not.
      await expect(page.locator("header").locator('a[href="/"]').first()).toBeVisible()
    })

    test(`the nav keeps its shape inside the app`, async ({ page }) => {
      await page.goto("/dashboard")
      const nav = page.locator("header").getByRole("navigation").first()

      // The original point, unchanged: About used to be hidden inside the app
      // shell as a "marketing link", so the nav had three entries on the way in
      // and two once you arrived — it changed shape under you. It is two
      // entries on both sides now, and this is what says they stay the same
      // two.
      for (const [label, href] of NAV_ENTRIES) {
        await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute(
          "href",
          href,
        )
      }
    })
  })
}
