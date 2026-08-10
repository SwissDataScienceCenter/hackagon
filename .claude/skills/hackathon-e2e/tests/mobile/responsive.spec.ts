import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { PERSONAS } from "../../personas.js"
import { storageStatePath } from "../../helpers/state.js"

// Smartphone battery (390×844): data-agnostic responsive checks over every
// surface, so it runs against the seeded smoke fixture AND any frozen
// journey state. Per page: no horizontal overflow, the header renders, and a
// full-page screenshot lands in .artifacts/mobile/ for visual review.

const SHOTS = ".artifacts/mobile"
fs.mkdirSync(SHOTS, { recursive: true })

/** Horizontal overflow is the cardinal mobile sin: assert none (1px slack),
 * and name the widest offending elements so the failure is self-diagnosing. */
async function expectFitsViewport(page: Page, name: string) {
  const { overflow, offenders } = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth + 1
    const offenders = Array.from(document.querySelectorAll("*"))
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter(({ right }) => right > limit)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5)
      .map(({ el, right }) => {
        const cls = String(el.className).split(" ").slice(0, 4).join(".")
        return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} right=${Math.round(right)}`
      })
    return {
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      offenders,
    }
  })
  expect(
    overflow,
    `${name} overflows horizontally by ${overflow}px; widest: ${offenders.join(" | ")}`,
  ).toBeLessThanOrEqual(1)
}

/** Every <img> must actually load: naturalWidth 0 means a broken asset. */
async function expectImagesRender(page: Page, name: string) {
  const broken = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img"))
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.getAttribute("src") ?? "(no src)"),
  )
  expect(broken, `${name} has broken images: ${broken.join(", ")}`).toHaveLength(0)
}

async function snap(page: Page, name: string) {
  await page.waitForLoadState("networkidle").catch(() => {})
  // Screenshot FIRST so the visual evidence exists even when checks fail.
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
  await expectFitsViewport(page, name)
  await expectImagesRender(page, name)
}

test.describe("anonymous surfaces", () => {
  test("public home", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("header")).toBeVisible()
    await snap(page, "01-public-home")
  })

  test("public event page", async ({ page }) => {
    await page.goto("/")
    const link = page.locator('a[href*="/hackathon/"]').first()
    test.skip((await link.count()) === 0, "no public hackathon listed")
    await link.click()
    await page.waitForURL(/\/hackathon\//)
    await snap(page, "02-public-event")
  })
})

test.describe("member surfaces (bob)", () => {
  test.use({ storageState: storageStatePath(PERSONAS.bob.key) })

  test("dashboard", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible()
    await snap(page, "03-dashboard")
  })

  // The member spine, as `memberNav` lists it. "proposals" moved under
  // "projects" — it is one person's own pending ideas, where "projects" is the
  // event's approved list, and the two are separate pages now. Voting joins the
  // list because it is a participant surface: the ballot is theirs to cast.
  for (const tab of [
    "overview",
    "teams",
    "projects",
    "projects/proposals",
    "timeline",
    "submissions",
    "participants",
    "voting",
  ]) {
    test(`member ${tab}`, async ({ page }) => {
      await page.goto("/dashboard")
      // Data-agnostic: enter the first hackathon bob is a member of.
      const row = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Your hackathons" }) })
        .locator('a[href*="/my/hackathon/"]')
        .first()
      test.skip((await row.count()) === 0, "bob is in no hackathon here")
      await row.click()
      await page.waitForURL(/\/my\/hackathon\/[^/]+\//)
      const base = page.url().replace(/\/my\/hackathon\/([^/]+)\/.*$/, "/my/hackathon/$1")
      const resp = await page.goto(`${base}/${tab}`)
      test.skip((resp?.status() ?? 500) >= 400, `${tab} not reachable for bob`)
      await snap(page, `04-member-${tab.replace("/", "-")}`)
    })
  }
})

test.describe("admin surfaces", () => {
  test.use({ storageState: storageStatePath(PERSONAS.admin.key) })

  test("manage users", async ({ page }) => {
    await page.goto("/manage/users")
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible()
    await snap(page, "05-manage-users")
  })
})
