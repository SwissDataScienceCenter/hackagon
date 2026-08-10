import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { PERSONAS } from "../../personas.js"
import { storageStatePath, SKILL_DIR } from "../../helpers/state.js"

/**
 * Documentation screenshots for docs/user-flows.md.
 *
 * Runs against the SEED fixture (`just db::seed`), which is built for exactly
 * this: an upcoming, an ongoing and a past hackathon, public and private, with
 * teams, draft/final submissions and a waitlisted person. Re-seeding keeps the
 * ongoing event ongoing, so the shots stay honest whenever they are retaken.
 *
 * Each step is captured twice — desktop 1440x900 and phone 390x844 — and
 * written as WebP directly into the docs folder. Viewport-sized rather than
 * full-page: this is meant to show what a person actually sees.
 *
 *   DOCS_SHOTS=1 pnpm exec playwright test --project=docs
 */
const enabled = !!process.env.DOCS_SHOTS

const OUT_DIR = path.resolve(SKILL_DIR, "../../../docs/flows")
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

async function shoot(page: Page, name: string, viewport: "desktop" | "phone") {
  // Fonts and lazily-loaded images settle after load; without this the hero
  // and logos are half-painted in about one shot in five.
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(350)

  const png = await page.screenshot()
  fs.mkdirSync(OUT_DIR, { recursive: true })
  await sharp(png)
    .webp({ quality: 82 })
    .toFile(path.join(OUT_DIR, `${name}-${viewport}.webp`))
}

/** One documented flow: a named sequence of steps, each ending in a shot. */
interface Flow {
  slug: string
  persona: keyof typeof PERSONAS | "anonymous"
  steps: { name: string; run: (page: Page) => Promise<void> }[]
}

const H_ONGOING = "Climate Tech Hackathon 2026"
const H_UPCOMING = "AI Innovation Challenge 2026"

/** Open the account menu (native <details>, so no hydration wait needed). */
async function openAccountMenu(page: Page) {
  await page.locator('header summary[aria-haspopup="menu"]').click()
  await expect(page.getByRole("menu")).toBeVisible()
}

const FLOWS: Flow[] = [
  {
    slug: "visitor",
    persona: "anonymous",
    steps: [
      {
        name: "1-landing",
        run: async (p) => {
          await p.goto("/")
        },
      },
      {
        name: "2-event",
        run: async (p) => {
          await p.goto("/")
          await p.locator('a[href^="/hackathon/"]').filter({ hasText: H_UPCOMING }).first().click()
          await expect(p).toHaveURL(/\/hackathon\//)
        },
      },
      {
        name: "3-about",
        run: async (p) => {
          await p.goto("/about")
        },
      },
    ],
  },
  {
    slug: "participant",
    persona: "bob",
    steps: [
      {
        name: "1-dashboard",
        run: async (p) => {
          await p.goto("/dashboard")
        },
      },
      {
        name: "2-overview",
        run: async (p) => {
          await p.goto("/dashboard")
          await p.locator("a").filter({ hasText: H_ONGOING }).first().click()
          await expect(p).toHaveURL(/\/my\/hackathon\//)
        },
      },
      {
        name: "3-teams",
        run: async (p) => {
          await p.goto("/dashboard")
          await p.locator("a").filter({ hasText: H_ONGOING }).first().click()
          await p.getByRole("link", { name: "Teams" }).first().click()
        },
      },
      {
        name: "4-submissions",
        run: async (p) => {
          await p.goto("/dashboard")
          await p.locator("a").filter({ hasText: H_ONGOING }).first().click()
          await p.getByRole("link", { name: "Submissions" }).first().click()
        },
      },
    ],
  },
  {
    slug: "account",
    persona: "alice",
    steps: [
      {
        name: "1-menu",
        run: async (p) => {
          await p.goto("/dashboard")
          await openAccountMenu(p)
        },
      },
      {
        name: "2-account",
        run: async (p) => {
          await p.goto("/account")
        },
      },
    ],
  },
  {
    slug: "organizer",
    persona: "admin",
    steps: [
      {
        name: "1-manage",
        run: async (p) => {
          await p.goto("/dashboard")
          await p.locator("a").filter({ hasText: H_ONGOING }).first().click()
          await p.getByRole("link", { name: "Manage" }).first().click()
        },
      },
      {
        name: "2-participants",
        run: async (p) => {
          await p.goto("/dashboard")
          await p.locator("a").filter({ hasText: H_ONGOING }).first().click()
          await p.getByRole("link", { name: "Participants" }).first().click()
        },
      },
    ],
  },
  {
    slug: "admin",
    persona: "admin",
    steps: [
      {
        name: "1-pages",
        run: async (p) => {
          await p.goto("/manage/pages")
        },
      },
      {
        name: "2-users",
        run: async (p) => {
          await p.goto("/manage/users")
        },
      },
    ],
  },
]

for (const flow of FLOWS) {
  test.describe(`docs: ${flow.slug}`, () => {
    test.skip(!enabled, "set DOCS_SHOTS=1 to regenerate documentation images")
    if (flow.persona !== "anonymous") {
      test.use({ storageState: storageStatePath(flow.persona) })
    }

    for (const step of flow.steps) {
      for (const [label, viewport] of [
        ["desktop", DESKTOP],
        ["phone", PHONE],
      ] as const) {
        test(`${flow.slug} ${step.name} ${label}`, async ({ page }) => {
          await page.setViewportSize(viewport)
          // Pin the theme: without it the shots inherit whatever the runner's
          // default happens to be, and a re-take could silently flip the whole
          // set from dark to light.
          await page.emulateMedia({ colorScheme: "dark" })
          await step.run(page)
          await shoot(page, `${flow.slug}-${step.name}`, label)
        })
      }
    }
  })
}
