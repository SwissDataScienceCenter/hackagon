import { test, expect } from "@playwright/test"
import {
  expectFitsViewport,
  expectNoOverlap,
  expectNoClippedText,
  expectConsentBannerClearsContent,
  expectFooterOperable,
  CONSENT_BANNER,
} from "../../helpers/reflow.js"

// The page chrome — header, footer, consent banner — must REFLOW at every
// width the app supports, never shrink-and-truncate. This exists because both
// ends broke on a real phone at once (2026-08-09): the header's 1fr_auto_1fr
// grid kept both outer columns equal below md, where the nav between them is
// hidden — the right column (theme switch + Log in + hamburger) held its
// content and the equal-width left column squeezed the wordmark to "H…"; and
// the footer was a fixed-height no-wrap flex row whose three groups need
// ~590px, so at phone widths logos, links and the tagline piled onto each
// other. Neither is a single-viewport bug, so this spec sweeps a range of
// widths on the public pages that mount the full chrome.
//
// The assertions live in helpers/reflow.ts, shared with the every-route sweep
// (full-sweep.spec.ts). This file keeps the DETAIL role: six widths on the
// three high-traffic public pages, with the chrome held to the STRICT checks
// (no ellipsis pardon, no geometric-containment pardon — the chrome layers
// nothing on purpose, so any intersection or truncation there is a defect).

const WIDTHS = [320, 360, 390, 768, 1024, 1440]
const PAGES = ["/", "/about", "/hackathon"]

// The width below which the header hides the wordmark text on purpose.
// Mirrors max-[389px]:hidden in NavBar.svelte (the signed-out bar leaves the
// full word ~22px short at 360, so the drop happens below the 390 class of
// phones rather than letting an ellipsis eat it).
const WORDMARK_MIN = 390

const BANNER = CONSENT_BANNER

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: width < 768 ? 844 : 900 } })

    for (const path of PAGES) {
      test(`chrome reflows on ${path}`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState("networkidle").catch(() => {})
        const name = `${width}px ${path}`

        // The scopes must exist, or every check below passes vacuously.
        await expect(page.locator("header")).toBeVisible()
        await expect(page.locator("footer")).toBeVisible()

        // Geometry first: its failures name the offending elements, which is
        // a far better diagnosis than a bare "wordmark not visible".
        await expectFitsViewport(page, name)
        for (const scope of ["header", "footer", BANNER]) {
          await expectNoOverlap(page, scope, name)
          await expectNoClippedText(page, scope, name)
        }

        // The footer's four links, hit-tested at the bottom of the document.
        // Width-swept for the same reason as the banner below: the footer wraps
        // from one spaced row into three centred ones as the viewport narrows,
        // so which link sits where — and what can end up drawn over it — is a
        // different answer at every width here.
        await expectFooterOperable(page, name)

        // The banner's own contract: on screen at the top, over nothing
        // operable at the end. Width-swept deliberately — it wraps to two and
        // three lines as the viewport narrows, so the space it has to reserve
        // is a different number at every width here and may never be a
        // hard-coded one.
        await expectConsentBannerClearsContent(page, name)

        // The wordmark: logo always; text whole wherever it is shown, and
        // shown at every width except the deliberate sub-360 drop. (A span
        // squeezed to zero width — the broken grid did exactly that — fails
        // toBeVisible, so "present but eaten" cannot pass.)
        const brand = page.locator("header a").first()
        await expect(brand.locator("img:visible").first()).toBeVisible()
        const wordmark = brand.locator("span").first()
        if (width >= WORDMARK_MIN) {
          await expect(
            wordmark,
            "the wordmark text may only be dropped below " +
              `${WORDMARK_MIN}px — at ${width}px it must render`,
          ).toBeVisible()
        }
      })
    }
  })
}
