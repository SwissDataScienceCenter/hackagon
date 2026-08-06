import fs from "node:fs"
import path from "node:path"
import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestType,
} from "@playwright/test"
import {
  EXTRAS,
  PERSONAS,
  type Credentials,
  type PersonaKey,
} from "../personas.js"
import { rpcAnonymous, rpcAsUser, ensureRegistered } from "./api.js"
import { implemented, probed } from "./capabilities.js"
import { anonymousContext, contextFor, loginViaKeycloak } from "./login.js"
import { content, dashboardRow, dashboardSection, homeRow } from "./ui.js"
import { SKILL_DIR } from "./state.js"
import {
  generateLogoPng,
  generateSubmissionAssets,
  pngDataUri,
} from "./files.js"

// ─── The recipe engine ───────────────────────────────────────────────────────
// Executes recipe.jsonl: one action per line, strictly in order (single
// worker, serial). Action types:
//   rpc            gRPC call as `actor` (or anonymous), gated on the
//                  capability probe — unimplemented methods SKIP with their
//                  TODO note, and start running the day the backend lands.
//   ui.assert      named browser assertion from UI_ASSERTS below; unknown
//                  names skip with their TODO (add the implementation here
//                  when the page renders real data).
//   ui.flow        chained navigation: goto/login/clickLink/expectText/... —
//                  simulates a real browsing session (home → X → Y).
//   files.generate deterministic upload-fixture bundle + format sanity.
//
// Variables: steps `save` values from responses (dot-path); later steps
// reference them as {{var:NAME}} / {{hackathonId}} / {{userId:USERname}}.
// If a producing step was skipped, every dependent step cascades to skip —
// so a partially-implemented backend yields a clean skipped-tail, not noise.

export interface FlowStep {
  goto?: string
  status?: number
  login?: boolean
  clickLink?: string
  clickButton?: string
  clickSelector?: string
  fill?: { selector: string; value: string }
  expectUrl?: string
  expectText?: string
  expectHeading?: string
  back?: boolean
}

export interface RecipeAction {
  comment?: string
  id: string
  /** Triage vs the current state of development (sketch/04-08-26):
   * P1 = runs today or its backend just landed (unskip/align now);
   * P2 = next wave (vote handler, windows, forms); P3 = later. */
  priority?: "P1" | "P2" | "P3"
  /** false = deliberately deferred (emails, branding, GDPR deletion) —
   * do not build now; the action stays as documentation. */
  implement?: boolean
  /** Human-readable expected outcome, derived from the machine assertions. */
  outcome?: string
  act: number
  t?: string
  title: string
  actor?: string
  action: "rpc" | "ui.assert" | "ui.flow" | "files.generate"
  method?: string
  assert?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any
  fresh?: boolean
  steps?: FlowStep[]
  save?: Record<string, string>
  expect?: { ok?: boolean; error?: string; check?: string; checkArgs?: unknown }
  /** Gate this action on DIFFERENT method(s) than the one it calls — for
   * steps whose own RPC works but whose precondition is gated (e.g. checking
   * the user list only after DeleteAccount exists), or that need several
   * capabilities at once (e.g. window enforcement AND CreateSubmission).
   * When present, `gate` fully replaces `method` for gating. */
  gate?: string | string[]
  todo?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTest = TestType<any, any>

export function loadRecipe(): RecipeAction[] {
  const file = path.join(SKILL_DIR, "recipe.jsonl")
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      try {
        return JSON.parse(l) as RecipeAction
      } catch (e) {
        throw new Error(`recipe.jsonl line ${i + 1} is not valid JSON: ${e}`)
      }
    })
    .filter((a) => !("comment" in a))
}

// ─── Cross-test state (single worker; serial) ────────────────────────────────

const vars = new Map<string, string>()
const skippedVars = new Set<string>()
const userIdCache = new Map<string, string>()
const DAY = 86_400_000

const logoCache = new Map<number, string>()
function logoFor(seed: number): string {
  let uri = logoCache.get(seed)
  if (!uri) {
    uri = pngDataUri(generateLogoPng(seed))
    logoCache.set(seed, uri)
  }
  return uri
}

class MissingVar extends Error {
  constructor(public varName: string) {
    super(`unresolved recipe variable: ${varName}`)
  }
}

function credsFor(username: string): Credentials {
  const principal = Object.values(PERSONAS).find((p) => p.username === username)
  if (principal) return { username: principal.username, password: principal.password }
  const extra = EXTRAS.find((e) => e.username === username)
  if (extra) return { username: extra.username, password: extra.password }
  throw new Error(`unknown recipe actor: ${username} (not in personas.ts or cast.json)`)
}

function personaKeyFor(username: string): PersonaKey {
  const entry = Object.entries(PERSONAS).find(([, p]) => p.username === username)
  if (!entry) {
    throw new Error(
      `actor ${username} has no browser session (only principals do) — UI actions must use admin/alice/bob/charles`,
    )
  }
  return entry[0] as PersonaKey
}

async function resolveToken(token: string): Promise<string> {
  if (token === "hackathonId") {
    const v = vars.get("hackathonId")
    if (!v) throw new MissingVar("hackathonId")
    return v
  }
  if (token === "logoDataUri") return logoFor(2027)
  if (token.startsWith("logoDataUri:")) return logoFor(Number(token.slice(12)))
  if (token.startsWith("var:")) {
    const name = token.slice(4)
    const v = vars.get(name)
    if (!v) throw new MissingVar(name)
    return v
  }
  if (token.startsWith("userId:")) {
    const username = token.slice(7)
    let id = userIdCache.get(username)
    if (!id) {
      id = await ensureRegistered(credsFor(username))
      userIdCache.set(username, id)
    }
    return id
  }
  const rel = token.match(/^now([+-])(\d+)d$/)
  if (rel) {
    const sign = rel[1] === "-" ? -1 : 1
    return new Date(Date.now() + sign * Number(rel[2]) * DAY).toISOString()
  }
  throw new Error(`unknown recipe template token: {{${token}}}`)
}

async function resolveDeep<T>(value: T): Promise<T> {
  if (typeof value === "string") {
    const tokens = [...value.matchAll(/\{\{([^{}]+)\}\}/g)]
    if (tokens.length === 0) return value
    let out = value as string
    for (const m of tokens) out = out.replace(m[0], await resolveToken(m[1]!))
    return out as T
  }
  if (Array.isArray(value)) {
    return (await Promise.all(value.map((v) => resolveDeep(v)))) as T
  }
  if (value && typeof value === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: any = {}
    for (const [k, v] of Object.entries(value)) out[k] = await resolveDeep(v)
    return out as T
  }
  return value
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPath(obj: any, dotted: string): unknown {
  return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

function skipAction(test: AnyTest, a: RecipeAction, reason: string): void {
  // A skipped producer poisons its outputs so dependents cascade-skip.
  for (const name of Object.keys(a.save ?? {})) skippedVars.add(name)
  test.skip(true, reason)
}

// ─── Post-condition checks (rpc `expect.check`) ──────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CHECKS: Record<string, (data: any, args: any) => void> = {
  logoRoundTrip(data, args) {
    expect(data.hackathon.logo).toBe(logoFor(args?.seed ?? 2027))
    if (args?.nameContains) expect(data.hackathon.name).toContain(args.nameContains)
    if (args?.descriptionContains) {
      expect(data.hackathon.description).toContain(args.descriptionContains)
    }
  },
  hackathonField(data, args) {
    if (args.nameEquals !== undefined) expect(data.hackathon.name).toBe(args.nameEquals)
    if (args.nameContains !== undefined) expect(data.hackathon.name).toContain(args.nameContains)
    if (args.descriptionContains !== undefined) {
      expect(data.hackathon.description).toContain(args.descriptionContains)
    }
  },
  formAnswers(data, args) {
    expect(data.submitted, "expected registration answers on file").toBe(true)
    for (const [k, v] of Object.entries(args.responses ?? {})) {
      expect(data.responses?.[k], `registration answer '${k}'`).toEqual(v)
    }
    for (const [k, v] of Object.entries(args.consents ?? {})) {
      expect(Boolean(data.consents?.[k]), `consent '${k}'`).toBe(v)
    }
  },
  profileName(data, args) {
    expect(data.user?.displayName, "profile display name").toBe(args.equals)
  },
  usersCount(data, args) {
    const users: unknown[] = data.users ?? []
    if (args.atLeast !== undefined) {
      expect(users.length, `expected >= ${args.atLeast} platform users`).toBeGreaterThanOrEqual(args.atLeast)
    }
  },
  usersLackNames(data, args) {
    const names = (data.users ?? []).map((u: { name?: string }) => u.name)
    for (const n of args.names as string[]) {
      expect(names, `deleted profile '${n}' must not appear in the user list`).not.toContain(n)
    }
  },
  listHasName(data, args) {
    const names = (data.hackathons ?? []).map((h: { name: string }) => h.name)
    expect(names, `list should contain '${args.name}'`).toContain(args.name)
  },
  listLacksName(data, args) {
    const names = (data.hackathons ?? []).map((h: { name: string }) => h.name)
    expect(names, `list must NOT contain '${args.name}'`).not.toContain(args.name)
  },
  roster(data, args) {
    const members: { isWaiting?: boolean }[] = data.hackathon.members ?? []
    const waiting = members.filter((m) => m.isWaiting === true)
    if (args.total !== undefined) expect(members).toHaveLength(args.total)
    if (args.waiting !== undefined) expect(waiting).toHaveLength(args.waiting)
    if (args.approved !== undefined) {
      expect(members.length - waiting.length).toBe(args.approved)
    }
  },
  votingWinner() {
    throw new Error(
      "TODO: implement the 'votingWinner' check in helpers/recipe.ts against the final VoteService.Results response shape.",
    )
  },
}

// ─── Named UI assertions (`ui.assert`) ───────────────────────────────────────
// Unknown names skip with the action's TODO — implement them here when the
// corresponding page renders real data.

type UiAssert = (page: Page, args: Record<string, never> | any) => Promise<void> // eslint-disable-line @typescript-eslint/no-explicit-any

const UI_ASSERTS: Record<string, UiAssert> = {
  async worldEmpty(page, args) {
    await page.goto("/")
    await expect(
      content(page).getByText(args.name),
      "Journey hackathon already exists — the recipe needs a fresh DB. Run: scripts/run.sh journey",
    ).toHaveCount(0)
  },
  async homeStatus(page, args) {
    await page.goto("/")
    const row = homeRow(page, args.name)
    await expect(row).toBeVisible()
    await expect(row.getByText(args.status)).toBeVisible()
  },
  async homeAbsent(page, args) {
    await page.goto("/")
    await expect(content(page).getByText(args.name)).toHaveCount(0)
  },
  async dashboardOthersShows(page, args) {
    await page.goto("/dashboard")
    await expect(
      dashboardSection(page, "Other hackathons").getByText(args.name),
    ).toBeVisible()
  },
  async dashboardBadge(page, args) {
    await page.goto("/dashboard")
    const row = dashboardRow(dashboardSection(page, "Your hackathons"), args.name)
    await expect(row).toBeVisible()
    await expect(row.getByText(args.badge, { exact: true })).toBeVisible()
  },
  async memberViewStatus(page, args) {
    const id = vars.get("hackathonId")
    if (!id) throw new MissingVar("hackathonId")
    const resp = await page.goto(`/my/hackathon/${id}/overview`)
    expect(resp?.status()).toBe(args.status)
  },
  async aboutVisible(page, args) {
    const id = vars.get("hackathonId")
    if (!id) throw new MissingVar("hackathonId")
    await page.goto(`/my/hackathon/${id}/overview`)
    await expect(visibleText(content(page), args.textContains).first()).toBeVisible()
  },
  async proposalsPage(page, args) {
    const id = vars.get("hackathonId")
    if (!id) throw new MissingVar("hackathonId")
    // "All Projects", not the old /proposals: this design splits the two by
    // AUDIENCE rather than by status. /projects/proposals is your own pending
    // ideas; this page publishes what was approved — and shows the pending ones
    // too when the viewer may review them, which is what makes it the
    // organiser's queue and the right place for this assertion.
    await page.goto(`/my/hackathon/${id}/projects`)
    for (const title of [...(args.approved ?? []), ...(args.proposed ?? [])]) {
      await expect(content(page).getByText(title, { exact: true })).toBeVisible()
    }
    // Status badges: at least one of each expected state is shown.
    if ((args.approved ?? []).length > 0) {
      await expect(visibleText(content(page), "Approved", true).first()).toBeVisible()
    }
    if ((args.proposed ?? []).length > 0) {
      await expect(visibleText(content(page), "Proposed", true).first()).toBeVisible()
    }
  },
  async timelinePhases(page, args) {
    const id = vars.get("hackathonId")
    if (!id) throw new MissingVar("hackathonId")
    await page.goto(`/my/hackathon/${id}/timeline`)
    // The phases are h4 — one level under the "Phases" section heading that
    // introduces the list. This read `ol h2`, which matched the page title
    // instead of the list when the heading levels were still flat.
    const headings = page.locator("ol h4")
    await expect(headings).toHaveText(args.phases as string[])
  },
  async publicWinnersPage(page, args) {
    const id = vars.get("hackathonId")
    if (!id) throw new MissingVar("hackathonId")
    await page.goto(`/hackathon/${id}`)
    await expect(content(page).getByText("Photos & Winners", { exact: true })).toBeVisible()
    await expect(visibleText(content(page), args.winner as string).first()).toBeVisible()
  },
  // Proves the markdown pipeline neutralizes hostile admin-authored content:
  // the prose renders, but neither the <script> nor the onerror handler in
  // the stored markdown ever executes (both would set window.__pwned).
  async sitePageSanitized(page, args) {
    await page.goto(`/${args.slug as string}`)
    await page.waitForLoadState("networkidle")
    await expect(visibleText(content(page), args.textContains as string).first()).toBeVisible()
    const pwned = await page.evaluate(
      () => (window as unknown as { __pwned?: boolean }).__pwned === true,
    )
    expect(pwned, "injected script executed — markdown is not sanitized").toBe(false)
    // ...and the hostile markup must not survive into the DOM either. Scope
    // this to the rendered markdown container: the surrounding page carries
    // SvelteKit/vite runtime scripts that legitimately contain `onerror=`,
    // so asserting over page.content() gives a false positive.
    const rendered = await page.locator(".markdown-content").first().innerHTML()
    expect(rendered, "a <script> tag survived sanitization").not.toContain("<script")
    expect(rendered, "an event handler survived sanitization").not.toContain("onerror")
  },
  async publicBlogEntry(page, args) {
    const id = vars.get("hackathonId")
    if (!id) throw new MissingVar("hackathonId")
    await page.goto(`/hackathon/${id}`)
    await expect(
      page.getByRole("heading", { name: new RegExp(args.titleContains as string) }),
    ).toBeVisible()
    await expect(visibleText(content(page), args.winner as string).first()).toBeVisible()
  },
  async submissionsPage(page, args) {
    const id = vars.get("hackathonId")
    if (!id) throw new MissingVar("hackathonId")
    await page.goto(`/my/hackathon/${id}/submissions`)
    for (const title of args.final as string[]) {
      await expect(visibleText(content(page), title, true).first()).toBeVisible()
    }
    await expect(visibleText(content(page), "Final", true).first()).toBeVisible()
  },
  async teamsPage(page, args) {
    const id = vars.get("hackathonId")
    if (!id) throw new MissingVar("hackathonId")
    await page.goto(`/my/hackathon/${id}/teams`)
    for (const [teamName, members] of Object.entries(
      args.teams as Record<string, string[]>,
    )) {
      await expect(content(page).getByText(teamName, { exact: true })).toBeVisible()
      for (const member of members) {
        await expect(visibleText(content(page), member, true).first()).toBeVisible()
      }
    }
  },
}

/**
 * Text that is actually ON SCREEN, not merely in the DOM.
 *
 * Two surfaces here keep history in collapsed `<details>` — the submissions
 * page's earlier versions, the timeline's past phases — so a bare `.first()`
 * lands on a hidden copy of the very string being asserted and fails with
 * "hidden" while the live one is right there. "The page shows X" means a
 * viewer can see it.
 */
function visibleText(scope: Locator, text: string, exact = false): Locator {
  return scope.getByText(text, { exact }).filter({ visible: true })
}

// ─── Executors ───────────────────────────────────────────────────────────────

async function actorContext(
  browser: Browser,
  actor: string | undefined,
  fresh: boolean,
): Promise<BrowserContext> {
  if (!actor || actor === "anonymous" || fresh) return anonymousContext(browser)
  return contextFor(browser, personaKeyFor(actor))
}

async function runRpc(test: AnyTest, a: RecipeAction): Promise<void> {
  const gates = a.gate ? ([] as string[]).concat(a.gate) : a.method ? [a.method] : []
  // A gate nobody probed is a hole in scripts/probe.sh, not a backend that has
  // not caught up — and it self-skips forever while the suite reports green.
  // Fail on it instead: the whole point of gating is that an action WAKES UP
  // when its RPC lands, which one absent from METHODS never does.
  const unprobed = gates.filter((g) => !probed(g))
  if (unprobed.length > 0) {
    throw new Error(
      `[${a.id}] gate(s) not in scripts/probe.sh METHODS: ${unprobed.join(", ")}. ` +
        `Add them there, or this action skips forever and never reports it.`,
    )
  }
  const missing = gates.filter((g) => !implemented(g))
  if (missing.length > 0) {
    skipAction(test, a, a.todo ?? `backend does not implement yet: ${missing.join(", ")}`)
    return
  }
  const params = await resolveDeep(a.params ?? {})
  // Extras exist only in Keycloak until their first platform action: register
  // them lazily through the same RPC the frontend uses (memoized in api.ts).
  if (a.actor && a.actor !== "anonymous" && a.method !== "user.UserService/Register") {
    await ensureRegistered(credsFor(a.actor))
  }
  const res =
    !a.actor || a.actor === "anonymous"
      ? rpcAnonymous(a.method!, params)
      : await rpcAsUser(credsFor(a.actor), a.method!, params)

  if (a.expect?.error) {
    expect(res.ok, `expected ${a.expect.error} but the call succeeded`).toBe(false)
    expect(res.code, res.raw).toBe(a.expect.error)
  } else {
    expect(res.ok, `${a.method} failed: ${res.raw}`).toBe(true)
  }
  if (a.expect?.check) {
    const check = CHECKS[a.expect.check]
    if (!check) throw new Error(`unknown check '${a.expect.check}' — add it to CHECKS in helpers/recipe.ts`)
    check(res.data, await resolveDeep(a.expect.checkArgs ?? {}))
  }
  for (const [name, dotted] of Object.entries(a.save ?? {})) {
    const v = getPath(res.data, dotted)
    if (typeof v !== "string" || !v) {
      throw new Error(
        `[${a.id}] save: response has no string at '${dotted}' — got ${JSON.stringify(v)}. Raw: ${res.raw}`,
      )
    }
    vars.set(name, v)
  }
}

async function runUiAssert(test: AnyTest, a: RecipeAction, browser: Browser): Promise<void> {
  const fn = UI_ASSERTS[a.assert ?? ""]
  if (!fn) {
    skipAction(
      test,
      a,
      a.todo ?? `UI assertion '${a.assert}' is not implemented yet (helpers/recipe.ts UI_ASSERTS)`,
    )
    return
  }
  const ctx = await actorContext(browser, a.actor, false)
  try {
    const page = await ctx.newPage()
    await fn(page, await resolveDeep(a.params ?? {}))
  } finally {
    await ctx.close()
  }
}

async function runFlow(test: AnyTest, a: RecipeAction, browser: Browser): Promise<void> {
  const ctx = await actorContext(browser, a.actor, a.fresh ?? false)
  try {
    const page = await ctx.newPage()
    for (const raw of a.steps ?? []) {
      const step = await resolveDeep(raw)
      if (step.login) {
        const key = personaKeyFor(a.actor ?? "")
        await loginViaKeycloak(page, PERSONAS[key])
      }
      if (step.goto) {
        const resp = await page.goto(step.goto)
        if (step.status !== undefined) expect(resp?.status()).toBe(step.status)
        // SvelteKit hydration: onclick handlers attach only after the page
        // settles; clicking earlier is a silent no-op (bit us twice).
        await page.waitForLoadState("networkidle").catch(() => {})
      }
      if (step.clickLink) {
        // Text content first — that is what "click the link that says X" means
        // for the hackathon-name links this mostly drives. But an icon-only
        // link has no text at all and is named by its aria-label (the account
        // control in the top bar), so fall back to the accessible name rather
        // than making the recipe reach for a CSS selector.
        const byText = page.locator("a").filter({ hasText: step.clickLink })
        const target = (await byText.count())
          ? byText.first()
          : page.getByRole("link", { name: step.clickLink }).first()
        await target.click()
      }
      if (step.clickButton) {
        // Exact match wins when one exists. Playwright's name matching is
        // substring AND case-insensitive, so the avatar step clickButton:"A"
        // also matched "Toggle light/d(a)rk mode" — and .first() clicked the
        // theme switch instead of opening the account menu. ("B" for bob
        // matched nothing else, so the same step passed for him.)
        const exact = page.getByRole("button", { name: step.clickButton, exact: true })
        const target =
          (await exact.count()) > 0
            ? exact
            : page.getByRole("button", { name: step.clickButton })
        await target.first().click()
      }
      if (step.clickSelector) await page.locator(step.clickSelector).click()
      if (step.fill) await page.locator(step.fill.selector).fill(step.fill.value)
      if (step.back) await page.goBack()
      if (step.expectUrl) await expect(page).toHaveURL(new RegExp(step.expectUrl))
      if (step.expectText) {
        // Whole page, not just <main>: flows also assert about the chrome
        // ("Log in" is the NavBar button). The named UI_ASSERTS below are the
        // ones that mean "the CONTENT shows this" and scope to <main>.
        //
        // VISIBLE matches only, then the first. The chrome carries text that
        // is in the DOM but not on screen — the hackathon sidebar renders the
        // event's name in a rail that collapses, so a page-wide `.first()`
        // resolved to a hidden span and failed while the same words were
        // plainly on the page. "The page shows X" means someone can see it.
        await expect(
          page.getByText(step.expectText).filter({ visible: true }).first(),
        ).toBeVisible()
      }
      if (step.expectHeading) {
        await expect(
          page
            .getByRole("heading", { name: step.expectHeading })
            .filter({ visible: true })
            .first(),
        ).toBeVisible()
      }
    }
  } finally {
    await ctx.close()
  }
}

function runFilesGenerate(a: RecipeAction): void {
  const p = a.params ?? {}
  // Determinism + format sanity, then write the bundle for the upload acts.
  expect(generateLogoPng(p.seed).equals(generateLogoPng(p.seed))).toBe(true)
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(generateLogoPng(p.seed).subarray(0, 8).equals(pngMagic)).toBe(true)

  const bundle = generateSubmissionAssets(p.slug, p.seed, {
    team: p.team,
    project: p.project,
    hackathon: vars.get("hackathonName") ?? p.project,
  })
  expect(bundle.assets.map((x) => x.name).sort()).toEqual([
    "README.md",
    "data-sample.csv",
    "final-report.pdf",
    "logo.png",
    "poster.svg",
  ])
  for (const asset of bundle.assets) {
    expect(asset.bytes, `${asset.name} must not be empty`).toBeGreaterThan(0)
  }
}

export async function runAction(
  test: AnyTest,
  a: RecipeAction,
  browser: Browser,
): Promise<void> {
  try {
    switch (a.action) {
      case "rpc":
        await runRpc(test, a)
        // Remember the event name for downstream file metadata.
        if (a.id === "act1.publish" && a.params?.name) vars.set("hackathonName", a.params.name)
        break
      case "ui.assert":
        await runUiAssert(test, a, browser)
        break
      case "ui.flow":
        await runFlow(test, a, browser)
        break
      case "files.generate":
        runFilesGenerate(a)
        break
      default:
        throw new Error(`[${a.id}] unknown action type: ${a.action}`)
    }
  } catch (e) {
    if (e instanceof MissingVar) {
      if (skippedVars.has(e.varName) || e.varName === "hackathonId") {
        skipAction(
          test,
          a,
          `depends on '${e.varName}' from a step that was skipped or did not run`,
        )
        return
      }
    }
    throw e
  }
}
