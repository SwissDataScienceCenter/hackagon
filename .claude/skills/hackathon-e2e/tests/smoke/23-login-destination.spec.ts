import { test, expect, type Page } from "@playwright/test"
import { PERSONAS, SEED_HACKATHONS } from "../../personas.js"
import { storageStatePath } from "../../helpers/state.js"
import {
  expectSignedIn,
  fillKeycloakForm,
  keycloakUrlPattern,
} from "../../helpers/login.js"
import { rpcAnonymous } from "../../helpers/api.js"

// Where a login STARTS and where it ENDS.
//
// Two complaints, one mechanism:
//
//   1. An anonymous visitor who opened a deep link was 303'd to the marketing
//      landing page with no word about why. They now land on /signin, which
//      says what happened and where it is taking them before it goes.
//   2. Signing in from that bounce dropped them on the dashboard regardless of
//      the link they had followed. The parked destination survives the whole
//      OIDC round trip now.
//
// The valuable assertion here is the ROUND TRIP, and it is deliberately written
// so the two outcomes cannot both pass by accident: "deep link" asserts the
// final URL IS the deep link (a redirect hard-wired to /dashboard fails it) and
// "no deep link" asserts the final URL is the dashboard (an implementation that
// always echoed the current path would land on "/" and fail it).
//
// The interstitial's own content is asserted with JAVASCRIPT DISABLED, which is
// both the accessibility floor this repo holds itself to and the only way to
// hold the page still: with script on it forwards itself after ~2s, so anything
// asserted there races the navigation it is there to cause.

const ALICE = PERSONAS.alice
const BOB = PERSONAS.bob

/** alice OWNS h1 in the SMOKE fixture, so this is a page she can really open. */
let deepLink = ""

// Resolved over gRPC rather than by reading the landing page: the first test in
// this file runs in a JS-disabled context, and a browser-based lookup here also
// pays for a cold context plus the landing page's hero and carousel images
// before it can read one href — which is how the first version of this hook blew
// its 60s budget on a fixture the suite had already proved was there.
test.beforeAll(() => {
  const listed = rpcAnonymous("hackathon.HackathonService/List", {
    visibilityFilter: 1,
  })
  if (!listed.ok) throw new Error(`HackathonService.List failed: ${listed.raw}`)
  const h1 = (
    listed.data.hackathons as { id: string; name: string }[] | undefined
  )?.find((h) => h.name === SEED_HACKATHONS.h1.name)
  if (!h1) {
    throw new Error(
      `seed hackathon "${SEED_HACKATHONS.h1.name}" not found — run scripts/run.sh smoke (it seeds) or scripts/seed.sh first`,
    )
  }
  deepLink = `/my/hackathon/${h1.id}/manage`
})

/** The interstitial's own live region — the element that STATES the facts. */
function status(page: Page) {
  return page.locator("main [role='status']")
}

/**
 * "Am I looking at the interstitial?" — asked of its HEADING, not of a
 * `[role=status]` anywhere on the page. Any page in the app may grow a live
 * region, and an absence-assertion built on a selector that broad would start
 * agreeing with the wrong thing the day one does.
 */
function interstitialHeading(page: Page) {
  return page.getByRole("heading", { name: "Sign in to continue" })
}

// ─── The interstitial, with no JavaScript at all ─────────────────────────────

test.describe("the interstitial without JavaScript", () => {
  test.use({
    javaScriptEnabled: false,
    storageState: { cookies: [], origins: [] },
  })

  test("explains what happened and names where it is going", async ({
    page,
  }) => {
    await page.goto(deepLink)
    expect(
      page.url(),
      "the guard must park the refused URL on the interstitial",
    ).toContain(`/signin?returnTo=${encodeURIComponent(deepLink)}`)

    // role="status" is an aria-live region: the explanation is the whole point
    // of this page, and one that only exists visually is not an explanation for
    // everybody. Asserted on the live region ITSELF, not on the section that
    // contains it — a container also contains the heading and the buttons, and
    // would agree with a page that announced nothing.
    const region = status(page)
    await expect(region).toBeVisible()
    await expect(region).toContainText("not signed in")
    await expect(
      region,
      "the page must name the URL that was refused",
    ).toContainText(deepLink)
    await expect(region, "and where it is sending them").toContainText(
      "login page",
    )

    // Nobody is stuck watching a countdown, and with no script this button is
    // the ONLY way onward — so it is also the honest thing for the text to
    // point at, which is what the no-script branch of the copy says.
    await expect(region).toContainText("button below")
    await expect(region).not.toContainText("Taking you")
    await expect(
      page.getByRole("button", { name: "Go to login now" }),
    ).toBeVisible()
  })

  test("does not pretend to forward a browser that cannot forward itself", async ({
    page,
  }) => {
    await page.goto(deepLink)
    const parked = page.url()
    // Comfortably past the 2s the scripted hop waits. A page that navigated
    // here would mean the timer does not depend on script — which would make
    // the "use the button below" copy a lie in the other direction.
    await page.waitForTimeout(4_000)
    expect(page.url(), "no script ⇒ no automatic hop").toBe(parked)
  })

  test("signs in and lands on the deep link, script or no script", async ({
    page,
  }) => {
    await page.goto(deepLink)
    await page.getByRole("button", { name: "Go to login now" }).click()

    // The form POST is the mechanism, not a decoration: it starts the real OIDC
    // flow. (A <meta http-equiv="refresh"> could not — a meta refresh issues a
    // GET and Auth.js mints its state/PKCE cookies on a POST.)
    await page.waitForURL(keycloakUrlPattern(), { timeout: 45_000 })
    await fillKeycloakForm(page, ALICE)

    await page.waitForURL(/localhost:8081/, { timeout: 30_000 })
    expect(
      page.url(),
      "the deep link must survive a scriptless login",
    ).toContain(deepLink)
    // Landed there AND signed in. Without this, a guard that bounced again
    // would be the only thing distinguishing success from failure, and the
    // bounce would put a different URL in the bar — but "the URL is right" and
    // "there is a session" are two claims, and only one of them was made.
    await expectSignedIn(page, ALICE.initial)
  })

  test("a crafted returnTo cannot become an off-site callback", async ({
    page,
  }) => {
    // The form's redirectTo is handed straight to Auth.js as the post-login
    // destination. An unvalidated one is an open redirect off the site, so the
    // assertion is on the VALUE the page is about to submit.
    const redirectTo = page.locator("form input[name='redirectTo']")

    for (const hostile of [
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
    ]) {
      await page.goto(`/signin?returnTo=${encodeURIComponent(hostile)}`)
      await expect(
        redirectTo,
        `${hostile} must not survive into the callback`,
      ).toHaveValue("/dashboard")
      await expect(status(page)).not.toContainText("evil.example")
    }

    // The positive control: a legitimate path DOES survive, so the assertions
    // above are not passing because the field is always "/dashboard".
    await page.goto(`/signin?returnTo=${encodeURIComponent(deepLink)}`)
    await expect(redirectTo).toHaveValue(deepLink)
  })

  test("renders with its chrome at a phone width", async ({ page }) => {
    // The mobile full sweep declares this route UNCOVERED — it cannot hold a
    // page that navigates away from itself — so the width that has caught every
    // reflow bug in this repo so far is checked in the place that can.
    const WIDTH = 360
    await page.setViewportSize({ width: WIDTH, height: 844 })
    await page.goto(deepLink)

    // Presence first. The geometry loop below measures whatever it is handed,
    // so a missing element would sail through it — the exact shape of the
    // "helper that no-ops when its subject is absent" trap.
    for (const scope of ["header", "main", "footer"]) {
      await expect(page.locator(scope), `${scope} must render`).toBeVisible()
    }

    // The one thing on this page that can genuinely overflow: the destination
    // is a real URL with a UUID in it, printed verbatim in a monospace run, and
    // an unbroken 55-character string is wider than a 360px phone. `break-all`
    // is what keeps it in; this is the assertion that notices if it goes.
    for (const [name, locator] of [
      ["heading", page.getByRole("heading", { name: "Sign in to continue" })],
      ["status region", status(page)],
      ["submit button", page.getByRole("button", { name: "Go to login now" })],
      ["footer", page.locator("footer")],
    ] as const) {
      await expect(locator, `${name} must be visible`).toBeVisible()
      const box = await locator.boundingBox()
      expect(box, `${name} should have a box`).not.toBeNull()
      expect(
        Math.round(box!.x + box!.width),
        `${name} runs past the right edge of a ${WIDTH}px screen`,
      ).toBeLessThanOrEqual(WIDTH)
      expect(
        Math.round(box!.x),
        `${name} starts left of a ${WIDTH}px screen`,
      ).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─── The round trip ──────────────────────────────────────────────────────────

test.describe("signing in from a deep link", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("forwards itself and comes back to the page that was asked for", async ({
    page,
  }) => {
    await page.goto(deepLink)

    // With script, the copy promises a hop — and the promise is kept below,
    // with no click of any kind.
    await expect(status(page)).toContainText("Taking you to the login page")

    await page.waitForURL(keycloakUrlPattern(), { timeout: 45_000 })
    await fillKeycloakForm(page, ALICE)

    await page.waitForURL(/localhost:8081/, { timeout: 30_000 })
    // THE assertion this whole file exists for. Not "somewhere sensible" and
    // not "the dashboard" — the page they followed a link to.
    expect(page.url()).toContain(deepLink)
    await expect(page).not.toHaveURL(/\/dashboard$/)

    // And it is the real page, not an error rendered at that URL.
    await expectSignedIn(page, ALICE.initial)
    await expect(page.locator("main")).toBeVisible()
  })
})

test.describe("signing in with nowhere in particular to go", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("lands on the dashboard", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "Log in" }).click()

    await page.waitForURL(keycloakUrlPattern(), { timeout: 45_000 })
    await fillKeycloakForm(page, BOB)

    await page.waitForURL(/localhost:8081/, { timeout: 30_000 })
    // The dashboard, NOT "/". Coming back to the page you started from reads as
    // "nothing happened", and this is the half of the behaviour that an
    // implementation echoing the current path would break.
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(
      page.getByRole("heading", { name: /Welcome back/ }),
    ).toBeVisible()
  })
})

// ─── Nobody who is already signed in waits for anything ──────────────────────

test.describe("a signed-in visitor", () => {
  test.use({ storageState: storageStatePath("alice") })

  test("never sees the interstitial, with or without a parked link", async ({
    page,
  }) => {
    // A positive control first, so "the heading is absent" below cannot be
    // absent for the boring reason. Signed out, this exact locator DOES find
    // the page — asserted in the no-JS block above and re-checked here in an
    // anonymous context of its own.
    const anon = await page
      .context()
      .browser()!
      .newContext({
        storageState: { cookies: [], origins: [] },
        javaScriptEnabled: false,
      })
    const anonPage = await anon.newPage()
    await anonPage.goto(deepLink)
    await expect(
      interstitialHeading(anonPage),
      "control: an anonymous visitor DOES land on the interstitial",
    ).toBeVisible()
    await anon.close()

    // Reached by hand (a stale link, a Back press out of Keycloak): forwarded
    // immediately, no explanation and no delay.
    await page.goto(`/signin?returnTo=${encodeURIComponent(deepLink)}`)
    expect(page.url()).toContain(deepLink)
    await expect(interstitialHeading(page)).toHaveCount(0)

    await page.goto("/signin")
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(interstitialHeading(page)).toHaveCount(0)

    // And the deep link itself simply opens — the guard is not in the way for
    // someone who is allowed through it.
    const resp = await page.goto(deepLink)
    expect(resp?.status()).toBe(200)
    await expect(interstitialHeading(page)).toHaveCount(0)
  })
})
