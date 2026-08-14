import { test, expect, type Page } from "@playwright/test"
import { ALL_PERSONAS, PERSONAS, SEED_HACKATHONS } from "../../personas.js"
import { storageStatePath } from "../../helpers/state.js"
import { rpcAnonymous } from "../../helpers/api.js"

// Reaching your own account, and signing out.
//
// This replaces the avatar-dropdown spec. That menu does not exist in this
// design: identity is a monogram <span> ("identity, not an action to be drawn
// toward"), and the things you can do about yourself — account, sign out — are
// controls in the top bar rather than items behind a disclosure.
//
// What is still worth pinning is the property the old spec existed for: every
// destination that concerns YOU is reachable from the chrome. /account backs
// EditProfile and account deletion and nothing else links to it, so an
// unreachable link means a dead feature — which is exactly what happened when
// the account link was first added to AppSidebar, a component no route mounts.

function header(page: Page) {
  return page.locator("header")
}

let h1Id = ""

test.beforeAll(() => {
  // Discovered the way a visitor would rather than hard-coded: seed UUIDs are
  // regenerated on every reset.
  const listed = rpcAnonymous("hackathon.HackathonService/List", {
    visibilityFilter: 1,
  })
  if (!listed.ok) throw new Error(`HackathonService.List failed: ${listed.raw}`)
  const found = (
    listed.data.hackathons as { id: string; name: string }[] | undefined
  )?.find((h) => h.name === SEED_HACKATHONS.h1.name)
  if (!found) {
    throw new Error(
      `seed hackathon "${SEED_HACKATHONS.h1.name}" not found — this spec needs ` +
        `the seed fixture (scripts/run.sh smoke seeds it)`,
    )
  }
  h1Id = found.id
})

/**
 * Walk the trail the account page describes, using the names IT gives.
 *
 * The labels are an argument rather than constants on purpose: the caller reads
 * them out of the page's own copy, so this asserts the sentence a person is
 * asked to follow, not a sentence a test author remembered. Feeding it labels
 * that name nothing is how the control below proves it can fail.
 */
async function expectTrailExists(
  page: Page,
  hackathonId: string,
  destination: string,
  control: string,
) {
  await page.goto(`/my/hackathon/${hackathonId}/overview`)
  await page.waitForLoadState("networkidle").catch(() => {})

  const entry = page
    .getByRole("link", { name: destination, exact: true })
    .filter({ visible: true })
    .first()
  await expect(
    entry,
    `the account page sends people to "${destination}" inside an event, and ` +
      `this event offers no such destination`,
  ).toBeVisible({ timeout: 10_000 })

  // Clicked, never `goto`-ed: goto proves a route exists, a click proves you
  // can GET there by doing what you were told (.claude/CLAUDE.md, pass 1).
  await entry.click()
  await expect(page).toHaveURL(/\/participants$/)

  // Asked of the SERVER, not inferred from what rendered: SvelteKit's error
  // page is a rendered page too, and a heading assertion cannot tell a 200 from
  // a 404 that happens to look tidy.
  const landed = await page.request.get(page.url())
  expect(
    landed.status(),
    `"${destination}" resolved to ${page.url()}, which did not answer 200`,
  ).toBe(200)

  // Your OWN row. The same control on someone else's row carries `?userId=`
  // and opens their answers read-only for an organiser — alice is one here, so
  // the page is full of those and picking `.first()` would prove the wrong
  // thing. The name is matched loosely because the row control is
  // `<a aria-label="View <name> profile">View</a>`: "View" is what a person
  // reads and what the copy can honestly name.
  const hrefs = await page
    .locator("main")
    .getByRole("link", { name: control })
    .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""))
  const mine = hrefs.filter(
    (h) => h.includes("/register/") && !h.includes("userId="),
  )
  expect(
    mine,
    `the account page tells people to use "${control}" on their own row of ` +
      `${page.url()}; no such control links to their own registration there ` +
      `(found: ${hrefs.join(", ") || "no links with that name at all"})`,
  ).toHaveLength(1)
  expect(mine[0]).toBe(`/register/${hackathonId}`)
}

test.describe("account, from the top bar", () => {
  test.use({ storageState: storageStatePath("alice") })

  test("the header identifies who is signed in", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(header(page).getByText(PERSONAS.alice.initial, { exact: true })).toBeVisible()
  })

  test("the account link reaches the account page", async ({ page }) => {
    await page.goto("/dashboard")
    // By its accessible name, not its position: it is an icon control on
    // desktop and a labelled row on phones, and both must work.
    await header(page).getByRole("link", { name: "Your account" }).first().click()

    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible()
  })

  test("the account page offers the profile edit and the deletion path", async ({ page }) => {
    await page.goto("/account")

    // The two things only this page can do.
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Delete my profile/ })).toBeVisible()
  })

  test("username and email link out to the identity provider", async ({ page }) => {
    await page.goto("/account")

    // Keycloak owns them and re-reads them from the token on every request, so
    // editing them here would be undone on the next page load. The page has to
    // send you where the change actually sticks.
    const out = page.getByRole("link", { name: /Change them there/ })
    await expect(out).toBeVisible()
    await expect(out).toHaveAttribute("href", /\/realms\/hackagon\/account$/)
  })

  // ─── The one thing this page sends you AWAY for ────────────────────────────
  //
  // Event-specific answers — an event's own questions, and the consents it
  // asked for — are not on the profile, and the page says where they are
  // instead. That sentence had gone stale: it named "Your registration answers
  // → View or edit", a block on the event overview that develop's `c596683c`
  // deleted, so anyone following it looked for a control that was not there.
  // `76037844` had moved the way in to the participants roster.
  //
  // Copy that names a control is a promise about the UI, and this repo has now
  // shipped the broken version of that promise several times (routes with no
  // inbound link; RPCs with no caller). So the check does not read the
  // sentence — it FOLLOWS it, and asserts the far end answers 200.

  test("the answers this page does not hold are where it says they are", async ({
    page,
  }) => {
    await page.goto("/account")

    const note = page.getByTestId("event-answers-note")
    await expect(
      note,
      "the account page no longer says where event-specific answers live — if " +
        "that paragraph was removed on purpose, remove this test with it; if it " +
        "was renamed, this is the check that was supposed to notice",
    ).toBeVisible()

    // The <strong>s ARE the claim: exactly the destination and the control a
    // person is told to look for. Read back rather than duplicated here, so a
    // re-wording is followed instead of silently diverging from what is tested.
    const named = await note.locator("strong").allInnerTexts()
    expect(
      named.map((s) => s.trim()),
      "this note is supposed to name exactly two things — the destination " +
        "inside the event, then the control on your own row. Emphasising a " +
        "third would make it ambiguous which one this test should follow, so " +
        "change the test deliberately rather than let it guess",
    ).toHaveLength(2)

    await expectTrailExists(page, h1Id, named[0].trim(), named[1].trim())
  })

  test("CONTROL: copy naming a control that does not exist fails the check", async ({
    page,
  }) => {
    // Positive control: the trail as the page describes it today.
    await expectTrailExists(page, h1Id, "Participants", "View")

    // And the trail as it described it until this fix — the exact words of the
    // block develop removed. An assertion that cannot reject the state that was
    // actually shipped is not guarding anything.
    await expect(
      expectTrailExists(page, h1Id, "Your registration answers", "View or edit"),
      "the stale instruction named a destination no event has; following it has " +
        "to fail, or this spec would have agreed with the copy it was written " +
        "to replace",
    ).rejects.toThrow()
  })
})

test.describe("sign out", () => {
  test.use({ storageState: storageStatePath(PERSONAS.bob.key) })

  test("returns to the public shell", async ({ page }) => {
    await page.goto("/dashboard")
    // signOut() is a client call, so this one genuinely needs hydration.
    await page.waitForLoadState("networkidle")

    await header(page).getByRole("button", { name: "Log out" }).first().click()

    await page.waitForURL(/localhost:8081\/($|\?)/, { timeout: 15_000 })
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible()

    // And the session is really gone, not just visually. Asked as the 303 the
    // guard answers with, not by landing on it: the /signin interstitial sends
    // itself to Keycloak a couple of seconds after it renders, so a browser
    // parked there is mid-navigation by the time an assertion runs. The
    // redirect is also the stronger claim — it is the SERVER refusing, where a
    // rendered page could be a cached one.
    const resp = await page.request.get("/dashboard", { maxRedirects: 0 })
    expect(resp.status()).toBe(303)
    expect(resp.headers()["location"]).toBe("/signin?returnTo=%2Fdashboard")
  })
})

test.describe("every persona can reach their account", () => {
  // The regression this guards: a link that exists in a component no route
  // renders. Cheap to check per persona, and it is the whole point of the page.
  for (const persona of ALL_PERSONAS) {
    test(`${persona.key}`, async ({ page, browser }) => {
      const ctx = await browser.newContext({ storageState: storageStatePath(persona.key) })
      const p = await ctx.newPage()
      await p.goto("/account")
      await expect(p.getByRole("heading", { name: "Your account" })).toBeVisible()
      await ctx.close()
      void page
    })
  }
})
