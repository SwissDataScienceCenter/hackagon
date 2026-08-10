import { test, expect } from "@playwright/test"
import { SELF_REGISTRANT } from "../../personas.js"
import { anonymousContext, registerViaKeycloak } from "../../helpers/login.js"

// The full new-user funnel through the REAL UI — the one path no other spec
// covers: Keycloak self-registration (every cast member elsewhere is
// provisioned via the admin API), auto-login back into the app, backend
// auto-registration on first dashboard load (WhoAmI -> Register), and joining
// a hackathon with the dashboard Join button (HackathonService.Join — the F2
// stub alert until it was wired).
//
// Wanda is a fixed persona (personas.ts SELF_REGISTRANT), so the run stays
// deterministic; the standard smoke reset wipes her between runs, and the
// register helper falls back to login on a --no-reset rerun.

test.describe("new user funnel: register → login → join", () => {
  test("self-registers via Keycloak and joins a hackathon onto the waitlist", async ({
    browser,
  }) => {
    const ctx = await anonymousContext(browser)
    const page = await ctx.newPage()
    await registerViaKeycloak(page, SELF_REGISTRANT)

    // First dashboard visit auto-registers the platform user.
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // A brand-new user has no memberships: everything is under "Other
    // hackathons". Join the first one through the real button.
    await expect(page.getByText("Other hackathons")).toBeVisible()
    await page.getByRole("button", { name: "Join" }).first().click()

    // Join puts new registrants on the waitlist (is_waiting until an
    // organizer approves): the hackathon moves into "My hackathons" with the
    // Waitlisted badge — the new user's only membership.
    await expect(page.getByText("Waitlisted")).toBeVisible({ timeout: 20_000 })

    await ctx.close()
  })
})
