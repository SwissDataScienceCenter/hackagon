import { test, expect, type Page, type Locator } from "@playwright/test"
import {
  ALL_PERSONAS,
  SEED_EXPECTATIONS,
  SEED_HACKATHONS,
  type SeedHackathonKey,
} from "../../personas.js"
import { storageStatePath } from "../../helpers/state.js"

// Dashboard content per persona, against the seed fixture. This encodes the
// seed's involvement matrix (cmd/seed/README.md): who is connected to what,
// with which membership badge (Owner / Member / Waitlisted from casbin +
// participant.is_waiting).
//
// THE FIXTURE IS NOT THE WHOLE DATABASE, and that is a supported state — a
// populated instance (what the public demo URL serves) also carries the six
// real SDSC editions from skills/seed-past-hackathons, created by
// hackagon-admin. Every assertion here is therefore phrased as a property that
// survives events the fixture never named: what the fixture puts on the page
// must be on it, what the fixture forbids must not be, and any NUMBER the page
// states is checked against the page's own rows rather than against a constant
// a second seeder silently changes. Three tests in this file failed for a day
// because they held that constant instead.

function section(page: Page, heading: string) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: heading }) })
}

// Each hackathon row is one HackathonRow link and the hackathon id is in its
// href, so the id — not the name — is the row's identity: exact, where a name
// match is a substring match across a list nobody enumerated.
//
// Both patterns are anchored and each admits EVERY link its section is supposed
// to hold, which is what lets `renderedIds` throw on anything else. A row that
// rendered the wrong destination then fails loudly instead of dropping out of
// an href-filtered count — and it is the same "my rows point at the member
// view / other rows point at the public page" claim, applied to every row on
// the page rather than to the handful the fixture happens to name.
//
// `/overview` alone now. The rows used to carry an edit pencil as well, so this
// admitted `/edit` too; editing a hackathon moved to its own Manage Hackathon
// page and that link is gone. Kept narrow rather than left permissive: an
// allowlist that admits a route the app no longer has agrees with a row pointing
// at a 404.
const MY_LINK = /^\/my\/hackathon\/([0-9a-f-]+)\/overview$/
const OTHER_LINK = /^\/hackathon\/([0-9a-f-]+)$/

/** The hackathon ids a dashboard section actually rendered, one per row. */
async function renderedIds(scope: Locator, allowed: RegExp): Promise<string[]> {
  const hrefs = await scope
    .locator("a")
    .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""))

  const ids = new Set<string>()
  for (const href of hrefs) {
    const m = allowed.exec(href)
    if (!m)
      throw new Error(
        `unexpected link in a dashboard hackathon list: "${href}" ` +
          `does not match ${allowed} — a row is pointing somewhere it should not`,
      )
    ids.add(m[1]!)
  }
  return [...ids]
}

/**
 * The number the page STATES it is connected to, read out of its own sentence.
 *
 * Also checks the sentence agrees with itself about plural, which the old
 * hard-coded regex proved as a side effect and which nothing else would.
 */
async function statedConnectedCount(page: Page): Promise<number> {
  const line = page.locator("main").getByText(/connected to \d+ hackathons?\b/)
  await expect(
    line,
    "the dashboard should say how many hackathons you are connected to",
  ).toBeVisible()

  // Normalized, because the sentence is four text nodes in the template with
  // the indentation of the file between them.
  const text = ((await line.textContent()) ?? "").replace(/\s+/g, " ").trim()
  const m = /connected to (\d+) hackathon(s?)\b/.exec(text)
  if (!m) throw new Error(`could not read a count out of "${text}"`)

  const n = Number(m[1])
  expect(m[2], `"${text}" should agree with itself about plural`).toBe(
    n === 1 ? "" : "s",
  )
  return n
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

    test("states a connected-hackathons count that matches its own list", async ({ page }) => {
      await page.goto("/dashboard")
      const mine = section(page, "Your hackathons")
      await expect(mine).toBeVisible()

      const stated = await statedConnectedCount(page)
      const rendered = await renderedIds(mine, MY_LINK)

      // Positive control for the equality below: "0 stated, 0 rendered" would
      // satisfy it on a page that rendered no list at all, and every persona in
      // the fixture is in at least one hackathon whatever else the instance
      // holds. This is a floor under a page that must not be empty, not a
      // substitute for the count assertion.
      expect(
        rendered.length,
        `${persona.key} is in ${expected.dashboard.mine.length} fixture hackathon(s), ` +
          `so "Your hackathons" cannot be shorter than that`,
      ).toBeGreaterThanOrEqual(expected.dashboard.mine.length)

      // The assertion: the sentence and the list are one fact stated twice
      // (both are `myHackathons` server-side), so a mismatch is a real bug — a
      // count that disagrees with the rows printed underneath it. A hard-coded
      // number could never catch that, and stops being true the moment anything
      // else populates the instance.
      expect(
        stated,
        `the page says "connected to ${stated}" above ${rendered.length} row(s) under "Your hackathons"`,
      ).toBe(rendered.length)
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

    test("offers the public hackathons the persona has not joined, and only those", async ({ page }) => {
      await page.goto("/dashboard")
      const others = section(page, "Other hackathons")
      const mine = section(page, "Your hackathons")
      await expect(others).toBeVisible()

      // The fixture side, both directions. Present: the public events this
      // persona is not in. Absent: everything they ARE in, and the private one
      // — offering someone a Join for an event they are already in, or for an
      // event they cannot see, are the two ways this section goes wrong with a
      // list of the right length.
      for (const key of expected.dashboard.others) {
        const name = SEED_HACKATHONS[key].name
        await expect(
          others.getByText(name),
          `${name} should be offered to ${persona.key} to join`,
        ).toBeVisible()
        // Scoped to its OWN row — a page-wide "first Join button" passes even
        // when the wrong row has it.
        await expect(row(others, name).getByRole("button", { name: "Join" })).toBeVisible()
      }
      for (const key of ["h1", "h2", "h3"] as SeedHackathonKey[]) {
        if (expected.dashboard.others.includes(key)) continue
        const name = SEED_HACKATHONS[key].name
        await expect(
          others.getByText(name),
          `${name} must not be offered to ${persona.key} to join`,
        ).toHaveCount(0)
      }

      // The whole-section side, over every row the instance produced rather than
      // only the ones the fixture named. For the personas who are in everything
      // the fixture has, the loops above assert nothing but absences — and the
      // one line this test used to have for them ("No other hackathons
      // available.") is a claim about the fixture's size, not about the page.
      //
      // `renderedIds` already made the strongest per-row claim on the way past:
      // every link in here is `/hackathon/<id>`, the public page, for all rows.
      const offered = await renderedIds(others, OTHER_LINK)
      const joined = await renderedIds(mine, MY_LINK)

      if (offered.length === 0) {
        // The empty state is asserted where it is TRUE — when the section
        // rendered nothing — rather than where the fixture predicts it.
        await expect(others.getByText("No other hackathons available.")).toBeVisible()
        return
      }
      await expect(
        others.getByText("No other hackathons available."),
        "a section with rows in it must not also claim to be empty",
      ).toHaveCount(0)

      // Control for the disjointness below: with an empty "Your hackathons" it
      // would hold no matter what this section offered.
      expect(joined.length, `${persona.key} should be in at least one hackathon`).toBeGreaterThan(0)
      expect(
        offered.filter((id) => joined.includes(id)),
        "a hackathon you are already in must never be offered to join",
      ).toEqual([])

      for (const id of offered) {
        // The BUTTON, not the row that contains it: a row whose hackathon is
        // named "…Join…" would satisfy a text match on the container.
        await expect(
          others
            .locator(`a[href="/hackathon/${id}"]`)
            .locator("xpath=../..")
            .getByRole("button", { name: "Join" }),
          `the row for ${id} should carry its own Join button`,
        ).toBeVisible()
      }
    })
  })
}
