import { test, expect, type Page } from "@playwright/test"
import { PERSONAS, SEED_HACKATHONS } from "../../personas.js"
import { storageStatePath } from "../../helpers/state.js"
import { rpcAnonymous } from "../../helpers/api.js"
import { expectFooterOperable, FOOTER_LINKS } from "../../helpers/reflow.js"

// The site footer on the SIGNED-IN half of the app, and what it is FOR.
//
// It was missing there entirely. The `(public)`/`(app)` route split (5551b8d)
// gave each group its own copy of the shell markup and only `(public)`'s copy
// mounted AppFooter, so /dashboard, /account, /hackathons/create, both
// /manage/* pages and all 21 /my/hackathon/* pages rendered without one. Both
// existing sweeps looked at "footer" on those routes and reported green,
// because the geometry helpers return early when their scope is absent.
//
// Why that is not cosmetic: the footer is the ONLY inbound link to the
// platform's own SitePages — Privacy, Terms, About. A route with no footer is a
// route from which the privacy policy cannot be reached, and this repo has now
// shipped an unreachable route three times (/account, /manage/pages, and the
// browse page — .claude/CLAUDE.md, "routes with no inbound link"). So this spec
// does not stop at "a <footer> element is present": it CLICKS the links and
// asserts what comes back.
//
// Layout properties (does the footer reflow, is it covered by the consent
// banner) belong to the mobile suite, which sweeps every route at two widths
// and guarantees a consent banner to assert about. This one owns presence and
// reachability, plus the one geometric claim only the signed-in shell can make:
// the hackathon sidebar is anchored to the VIEWPORT, so it can be drawn over a
// footer that is at the bottom of the document.

/** slug -> the <h1> the SitePage renders (cmd/seed/main.go, seedSitePages). */
const SITE_PAGES = [
  { label: "Privacy", href: "/privacy", title: "Privacy" },
  { label: "Terms", href: "/terms", title: "Terms of use" },
  { label: "About", href: "/about", title: "About Hackagon" },
]

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
 * The hackathon sidebar must not be drawn on top of the footer.
 *
 * This is the one hazard the signed-in shell has and the public one does not.
 * HackathonSidebar is `md:sticky md:top-14 md:h-[calc(100vh-3.5rem)]` — a
 * full-screen-height column anchored to the VIEWPORT — and viewport-anchored
 * chrome over page-bottom chrome is a bug this repo has already shipped twice
 * (the consent banner as a lid; the same sidebar's last four entries under it).
 * Adding a footer below that column is exactly the setup for a third.
 *
 * It holds today for a reason worth writing down, because it is NOT the
 * reasoning that first suggests itself. A sticky box taller than its containing
 * block cannot move at all, so the sidebar looks like it should overhang the row
 * it lives in on any page whose content is shorter than the screen — and the
 * footer sits directly below that row. It does not, because the row is a FLEX
 * CONTAINER: its height is its tallest item's, and with `md:self-start` on the
 * aside that item is the 100vh-3.5rem sidebar. The row therefore grows to the
 * sidebar rather than the sidebar escaping the row. Measured, not assumed — the
 * belt-and-braces `min-h` this was written to protect turned out to change
 * nothing and was dropped.
 *
 * So this is a guard on a property that currently emerges from flex sizing, and
 * would vanish the moment anyone takes the column out of flow (`md:fixed`) or
 * gives the row a fixed height. It asserts the OUTCOME, so it does not care
 * which of those happens.
 *
 * Checked at the TOP of the page deliberately: that is where an overhang would
 * be, and scrolling to the end moves a sticky column up and out of the way.
 */
async function expectSidebarClearsFooter(page: Page, name: string) {
  const overlap = await page.evaluate(() => {
    const f = document.querySelector("footer")
    const asides = Array.from(document.querySelectorAll("aside"))
    if (!f || asides.length === 0) return null
    const fr = f.getBoundingClientRect()
    const TOL = 2
    const hits: string[] = []
    for (const a of asides) {
      const cs = getComputedStyle(a)
      if (cs.display === "none" || cs.visibility === "hidden") continue
      const r = a.getBoundingClientRect()
      const x = Math.min(r.right, fr.right) - Math.max(r.left, fr.left)
      const y = Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top)
      if (x <= TOL || y <= TOL) continue
      hits.push(
        `aside(${cs.position}, ${Math.round(r.width)}x${Math.round(r.height)}) ` +
          `over the footer by ${Math.round(x)}x${Math.round(y)}px`,
      )
    }
    return hits
  })

  // null means no footer or no sidebar on this page — either makes the claim
  // vacuous, and both are bugs on the routes this is called for.
  expect(
    overlap,
    `${name}: expected both a <footer> and the hackathon <aside> to be present, ` +
      `or this check verifies nothing`,
  ).not.toBeNull()
  expect(
    overlap,
    `${name}: the hackathon sidebar is drawn over the footer: ${overlap?.join(" | ")}`,
  ).toEqual([])
}

// ─── Presence, on every signed-in surface ────────────────────────────────────

test.describe("the footer reaches every signed-in page", () => {
  test.describe("as a member", () => {
    test.use({ storageState: storageStatePath(PERSONAS.alice.key) })

    for (const path of ["/dashboard", "/account"]) {
      test(`${path} carries a usable footer`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState("networkidle").catch(() => {})
        await expectFooterOperable(page, `smoke ${path} as alice`)
      })
    }

    // The hackathon subtree: the one place in the app with a viewport-anchored
    // column beside the page, so the one place a footer can be covered by
    // something other than the consent banner. `webinars` and `invites` are here
    // because their content is SHORT — a page taller than the screen hides this
    // class of bug completely, which is why the route list is not just
    // /overview.
    for (const leaf of ["overview", "webinars", "invites", "prizes"]) {
      test(`/my/hackathon/[id]/${leaf} carries a usable footer`, async ({
        page,
      }) => {
        const name = `smoke /my/hackathon/[id]/${leaf} as alice`
        await page.goto(`/my/hackathon/${h1Id}/${leaf}`)
        await page.waitForLoadState("networkidle").catch(() => {})
        await expectFooterOperable(page, name)
        await expectSidebarClearsFooter(page, name)
      })
    }
  })

  test.describe("as a global admin", () => {
    test.use({ storageState: storageStatePath(PERSONAS.admin.key) })

    for (const path of [
      "/manage/pages",
      "/manage/users",
      "/hackathons/create",
    ]) {
      test(`${path} carries a usable footer`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState("networkidle").catch(() => {})
        await expectFooterOperable(page, `smoke ${path} as admin`)
      })
    }
  })
})

// ─── Reachability: the links go somewhere ────────────────────────────────────

test.describe("the footer's links resolve from inside the app", () => {
  test.use({ storageState: storageStatePath(PERSONAS.alice.key) })

  test("Privacy, Terms and About are reachable from the dashboard", async ({
    page,
  }) => {
    for (const target of SITE_PAGES) {
      await page.goto("/dashboard")
      await page.waitForLoadState("networkidle").catch(() => {})

      // Scoped to the <footer>, never page-wide: "Privacy" and "About" also
      // appear in the consent sentence and in the header nav, and a check that
      // matches those would pass with no footer at all.
      const link = page
        .locator("footer")
        .getByRole("link", { name: target.label, exact: true })
      await expect(link).toHaveAttribute("href", target.href)

      // Clicked, not `goto`-ed. `goto` proves the route exists; only a click
      // proves you can GET there from the dashboard, which is the property that
      // was broken (.claude/CLAUDE.md, pass 1: "goto proves nothing").
      await link.click()
      await expect(page).toHaveURL(new RegExp(`${target.href}$`))

      // The rendered title is the proof it RESOLVED: an unknown slug 404s and
      // SvelteKit's error page carries a different heading entirely.
      await expect(
        page.locator("main").getByRole("heading", { level: 1 }),
        `following the footer's "${target.label}" link from the dashboard did ` +
          `not land on the ${target.href} SitePage`,
      ).toHaveText(target.title)
    }
  })

  test("the GitHub link points off-site and nowhere else", async ({ page }) => {
    // Not followed — an external navigation in a suite that has no network
    // contract with github.com is a flake waiting to happen. The href is the
    // whole claim.
    await page.goto("/dashboard")
    const href = await page
      .locator("footer")
      .getByRole("link", { name: "GitHub", exact: true })
      .getAttribute("href")
    expect(
      href,
      "the footer's GitHub link must be an absolute https URL",
    ).toMatch(/^https:\/\/github\.com/)
  })

  // ─── Controls: each assertion above, shown failing ─────────────────────────
  //
  // Every check in this file is an ABSENCE claim ("nothing covers the footer",
  // "no route lacks one"), and an absence claim that cannot fail agrees with
  // everything. This repo has shipped four of those (.claude/CLAUDE.md, "Ways a
  // test reported green while proving nothing") — a vacuous zero-hit grep, a
  // count nobody read back, a field that moved out from under a check.
  //
  // Each control breaks ONE property in the live DOM and asserts the helper
  // rejects. Done here rather than by editing a layout and re-running by hand:
  // a temporary source edit proves it once, for whoever was watching, and then
  // stops existing. (The three defects reproduced below are all real: the
  // missing footer is what this whole spec was written for; the lid is the
  // consent banner while it was `fixed bottom-0`; the out-of-flow column is
  // what `md:fixed` on HackathonSidebar does, verified against the source too —
  // it put the aside 287x63px over the footer on the three short leaves.)

  test("CONTROL: a missing footer fails the check", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle").catch(() => {})

    // Positive control first: it passes on this page as it stands. Without
    // this, a helper that threw unconditionally would look like a good check.
    await expectFooterOperable(page, "control (footer present)")

    // Now the state the (app) group was actually in.
    await page.evaluate(() => document.querySelector("footer")?.remove())
    await expect(
      expectFooterOperable(page, "control (footer removed)"),
      "expectFooterOperable must reject when the page has no footer — that is " +
        "the exact state /dashboard shipped in",
    ).rejects.toThrow()
  })

  test("CONTROL: a lid over the page bottom fails the check", async ({
    page,
  }) => {
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle").catch(() => {})

    // The consent banner, as it was before it became `sticky`: drawn over the
    // bottom of the viewport, taking no space, so no scroll position frees what
    // is under it. It covered these four links at every width.
    await page.evaluate(() => {
      const lid = document.createElement("div")
      lid.setAttribute("aria-label", "control lid")
      lid.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;height:300px;z-index:99"
      document.body.appendChild(lid)
    })

    await expect(
      expectFooterOperable(page, "control (lid)"),
      "the footer's links are present and visible under the lid — only the hit " +
        "test can tell that apart from usable, which is why it exists",
    ).rejects.toThrow(/cannot be clicked/)
  })

  test("CONTROL: an out-of-flow sidebar fails the overlap check", async ({
    page,
  }) => {
    await page.goto(`/my/hackathon/${h1Id}/webinars`)
    await page.waitForLoadState("networkidle").catch(() => {})

    await expectSidebarClearsFooter(page, "control (sidebar in flow)")

    // Take the column out of the flex row it is sized by. This is the whole
    // mechanism — see the note on expectSidebarClearsFooter.
    await page.evaluate(() => {
      const aside = document.querySelector("aside")
      if (aside) (aside as HTMLElement).style.position = "fixed"
    })
    await expect(
      expectSidebarClearsFooter(page, "control (sidebar fixed)"),
      "a viewport-anchored sidebar is drawn over the footer, and this check is " +
        "what would say so",
    ).rejects.toThrow(/drawn over the footer/)
  })

  test("the footer is the same footer on both sides of the login", async ({
    page,
  }) => {
    // The public group and the app group render one AppShell now. If they drift
    // apart again — a second copy of the markup, a group-specific footer — this
    // is what says so, and it says it in terms of what a reader can see rather
    // than which component was imported.
    const labelsOn = async (path: string) => {
      await page.goto(path)
      await page.waitForLoadState("networkidle").catch(() => {})
      return page
        .locator("footer")
        .getByRole("link")
        .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()))
    }

    const publicLabels = await labelsOn("/hackathon")
    const appLabels = await labelsOn("/dashboard")

    expect(
      publicLabels,
      "the public footer lost a link — FOOTER_LINKS is the contract both sides share",
    ).toEqual(FOOTER_LINKS)
    expect(
      appLabels,
      "the signed-in footer differs from the public one; they are supposed to " +
        "be the same component (AppShell)",
    ).toEqual(publicLabels)
  })
})
