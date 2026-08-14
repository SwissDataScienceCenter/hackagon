import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import { SEED_HACKATHONS } from "../../personas.js"

// The public browse page, and what happens when you join an event that asks
// its registrants questions.

test.describe("browse hackathons", () => {
  test("anyone can browse the panels without an account", async ({ page }) => {
    await page.goto("/hackathon")
    await page.waitForLoadState("networkidle")

    await expect(
      page.getByRole("heading", { name: "Hackathons", level: 1 }),
    ).toBeVisible()
    // Panels link to the public event page.
    const card = page
      .locator('a[href^="/hackathon/"]')
      .filter({ hasText: SEED_HACKATHONS.h1.name })
    await expect(card.first()).toBeVisible()

    // Private events are filtered server-side, not hidden in the UI.
    await expect(page.getByText(SEED_HACKATHONS.h3.name)).toHaveCount(0)
  })

  test("searches and filters across them", async ({ page }) => {
    await page.goto("/hackathon")
    await page.waitForLoadState("networkidle")

    await page.getByRole("searchbox").first().fill("climate")
    await expect(page.getByText(SEED_HACKATHONS.h2.name).first()).toBeVisible()
    await expect(page.getByText(SEED_HACKATHONS.h1.name)).toHaveCount(0)

    await page.getByRole("button", { name: "clear" }).click()
    // Status filter: the seed's h1 is upcoming, h2 is running.
    await page.getByLabel("Status").selectOption("2")
    await expect(page.getByText(SEED_HACKATHONS.h2.name).first()).toBeVisible()
    await expect(page.getByText(SEED_HACKATHONS.h1.name)).toHaveCount(0)
  })

  test("a panel opens the event", async ({ page }) => {
    await page.goto("/hackathon")
    await page.waitForLoadState("networkidle")
    await page
      .locator('a[href^="/hackathon/"]')
      .filter({ hasText: SEED_HACKATHONS.h1.name })
      .first()
      .click()
    await expect(page).toHaveURL(/\/hackathon\/[0-9a-f-]+$/)
    // The event page also renders a "Welcome to <name>" page heading, so
    // match the hero exactly rather than by substring.
    await expect(
      page.getByRole("heading", { name: SEED_HACKATHONS.h1.name, exact: true }),
    ).toBeVisible()
  })
})

test.describe("joining an event that asks questions", () => {
  test.use({ storageState: storageStatePath("charles") })

  test("lands on the organizer's registration form, or actually joins", async ({
    page,
  }) => {
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // Not `test.skip` on zero. A skip here fired on EVERY run once the
    // instance carried finished events, and a suite cannot tell "nothing to
    // join" from "the gate is too strict" — both render zero buttons. The
    // dashboard now offers Join only where it can succeed, so zero is a
    // failure of the fixture or of the gate, and either deserves saying.
    const joinable = page.getByRole("button", { name: "Join" })
    await expect(
      joinable.first(),
      "the dashboard offers charles no Join button at all — either every " +
        "public event refuses registration, or joinIsOffered() is too strict. " +
        "This test proves nothing without one.",
    ).toBeVisible()

    await joinable.first().click()
    await page.waitForLoadState("networkidle")

    // Joining is only half of signing up when an event asks for an affiliation
    // or a code-of-conduct consent. Either the form opens, or the event asks
    // nothing and the join completes — both are correct.
    //
    // ⚠ The else-branch must assert a POSITIVE success signal. It used to
    // assert only `toHaveURL(/\/dashboard/)`, which a REFUSED join satisfies
    // just as well — and that is what was happening: charles's target had its
    // `register` capability disabled, so this spec drove a join that always
    // failed and reported green for months. A disjunction is only a test when
    // every branch is a success; one that also accepts the failure is a
    // tautology. The two outcomes are distinguishable because the action
    // renders them differently: role="status" on success, role="alert" on
    // refusal.
    if (page.url().includes("/register/")) {
      await expect(
        page.getByRole("heading", { name: /Registration|Your registration/ }),
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: /Submit registration|Save changes/ }),
      ).toBeVisible()
    } else {
      await expect(page).toHaveURL(/\/dashboard/)
      await expect(
        page.getByRole("status"),
        'a join that asks nothing must SAY it landed — "you\'re in", or which ' +
          "place in the queue. Without this the branch passes on a refusal.",
      ).toBeVisible()
      await expect(
        page.getByRole("alert"),
        "the join was refused; the button should not have been offered",
      ).toHaveCount(0)
    }
  })
})
