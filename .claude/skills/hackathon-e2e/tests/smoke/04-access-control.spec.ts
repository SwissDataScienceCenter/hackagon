import { test, expect } from "@playwright/test"
import {
  ALL_PERSONAS,
  SEED_EXPECTATIONS,
  SEED_HACKATHONS,
  type SeedHackathonKey,
} from "../../personas.js"
import { anonymousContext, contextFor } from "../../helpers/login.js"
import { publicHackathonId, myHackathonId } from "../../helpers/discover.js"

// The backend is authoritative for access: /my/hackathon/<id> calls
// HackathonService.Get, which runs a casbin Read check. The frontend only
// translates PERMISSION_DENIED -> 403 and NOT_FOUND -> 404. This spec pins
// the full persona x hackathon access matrix from personas.ts.

const ids: Partial<Record<SeedHackathonKey, string>> = {}

test.beforeAll(async ({ browser }) => {
  // Public ids from the anonymous home page; the private H3 id via alice, who
  // is connected to it.
  const anon = await anonymousContext(browser)
  const page = await anon.newPage()
  ids.h1 = await publicHackathonId(page, SEED_HACKATHONS.h1.name)
  ids.h2 = await publicHackathonId(page, SEED_HACKATHONS.h2.name)
  await anon.close()

  const alice = await contextFor(browser, "alice")
  const alicePage = await alice.newPage()
  ids.h3 = await myHackathonId(alicePage, SEED_HACKATHONS.h3.name)
  await alice.close()
})

for (const persona of ALL_PERSONAS) {
  const matrix = SEED_EXPECTATIONS[persona.key].memberView

  test(`${persona.key}: member-view access matrix`, async ({ browser }) => {
    const ctx = await contextFor(browser, persona.key)
    const page = await ctx.newPage()

    for (const key of ["h1", "h2", "h3"] as const) {
      const name = SEED_HACKATHONS[key].name
      const resp = await page.goto(`/my/hackathon/${ids[key]}/overview`)
      const status = resp?.status()

      if (matrix[key] === "ok") {
        expect(status, `${persona.key} must reach the ${name} member view`).toBe(200)
      } else {
        expect(status, `${persona.key} must get 403 on the ${name} member view`).toBe(403)
      }
    }
    await ctx.close()
  })
}

test("unknown hackathon id yields 404 (as admin, who passes the casbin check)", async ({
  browser,
}) => {
  // Non-admins without a role on the unknown domain fail the casbin check
  // first and get 403 — only admin reaches the existence check.
  const ctx = await contextFor(browser, "admin")
  const page = await ctx.newPage()
  const resp = await page.goto(
    "/my/hackathon/00000000-0000-0000-0000-000000000000/overview",
  )
  expect(resp?.status()).toBe(404)
  await ctx.close()
})

test("anonymous visitors are redirected away from the member view", async ({
  browser,
}) => {
  const ctx = await anonymousContext(browser)
  const page = await ctx.newPage()
  const target = `/my/hackathon/${ids.h1}/overview`
  // Asserted on the 303, not on the page it lands on: the /signin interstitial
  // forwards itself to the identity provider a couple of seconds after it
  // renders, so a browser sitting there is mid-navigation by the time an
  // assertion runs. What matters here is that the member view refuses an
  // anonymous caller AND that the link they wanted survives the refusal.
  const resp = await page.request.get(target, { maxRedirects: 0 })
  expect(resp.status()).toBe(303)
  expect(resp.headers()["location"]).toBe(
    `/signin?returnTo=${encodeURIComponent(target)}`,
  )
  await ctx.close()
})
