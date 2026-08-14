import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { SEED_HACKATHONS, type PersonaKey } from "../../personas.js"
import { SKILL_DIR, storageStatePath } from "../../helpers/state.js"
import { rpcAnonymous, rpcAs } from "../../helpers/api.js"
import {
  expectFitsViewport,
  expectNoOverlap,
  expectNoClippedText,
  expectConsentBannerClearsContent,
  expectFooterOperable,
  CONSENT_BANNER,
} from "../../helpers/reflow.js"

// EVERY +page.svelte route, reflow-checked at a phone width and a desktop
// width. chrome-reflow.spec.ts keeps the six-width DETAIL sweep on the three
// high-traffic public pages; this file trades width resolution for route
// coverage: 2 widths × every route. 360 because every reflow failure found so
// far reproduced at ≤390 and 360 is the narrow end of the mainstream phone
// class (320 stays covered by the chrome sweep); 1440 because desktop-only
// regressions (nav centring, wide grids) are invisible at phone widths and a
// second width is nearly free. Six widths on 42 routes would be ~250 visits —
// too slow for every run, and the intermediate widths have never caught a bug
// the two extremes missed.
//
// COVERAGE IS ASSERTED, NOT ASSUMED. The route list is enumerated from the
// frontend's own route tree (src/routes/**/+page.svelte) at runtime, and the
// final test fails if any enumerated route has neither a sweep entry nor an
// explicit UNCOVERED declaration with a reason. A sweep that quietly visits
// 20 of 42 and reports green is the exact failure mode this repo keeps
// finding (four prior instances in .claude/CLAUDE.md) — a new route turns
// this suite red until someone says how to reach it.
//
// Auth and data: the sweep runs against the SEEDED fixture (scripts/run.sh
// mobile seeds it) and picks per route the persona who sees the page's
// RICHEST variant — alice owns h1, so organizer tools render their controls;
// bob is a plain member, so the ballot (not the category editor) renders on
// his voting visit; a page that 403s proves nothing about its layout, and a
// non-2xx/3xx answer FAILS the visit rather than skipping it. State the
// fixture lacks (registration form, invite link, vote categories, prizes) is
// created over gRPC in beforeAll — real ids from the running instance, never
// fabricated UUIDs.

// ─── Widths ──────────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { width: 360, height: 844 },
  { width: 1440, height: 900 },
]

const BANNER = CONSENT_BANNER
const SHOTS = ".artifacts/sweep"
fs.mkdirSync(SHOTS, { recursive: true })

// ─── Route enumeration (the source of truth for coverage) ────────────────────

const ROOT_DIR = path.resolve(SKILL_DIR, "..", "..", "..")
const ROUTES_DIR = path.join(
  ROOT_DIR,
  "components",
  "frontend",
  "src",
  "routes",
)

/** Every route pattern that owns a +page.svelte, layout groups stripped:
 * `(app)/my/hackathon/[id]/teams/+page.svelte` → `/my/hackathon/[id]/teams`. */
function enumerateRoutes(dir: string, segs: string[] = []): string[] {
  const out: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  if (entries.some((e) => e.isFile() && e.name === "+page.svelte")) {
    out.push("/" + segs.join("/"))
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const next =
      e.name.startsWith("(") && e.name.endsWith(")") ? segs : [...segs, e.name]
    out.push(...enumerateRoutes(path.join(dir, e.name), next))
  }
  return out
}

// ─── Fixture ids, resolved from the running instance ─────────────────────────

interface SweepIds {
  /** h1 — "AI Innovation Challenge 2026", public, owned by alice. */
  h1: string
  /** An approved project in h1 ("AutoML Pipeline Builder", alice's). */
  approvedProject: string
  /** A PROPOSED project authored by bob ("Federated Learning Framework") —
   * the proposals list and its edit page are the author's own view. */
  bobProposal: string
  phase: string
  track: string
  page: string
  inviteToken: string
}

let ids: SweepIds | null = null

/** ids, or a loud explanation of which setup step never ran. */
function id(key: keyof SweepIds): string {
  if (!ids) {
    throw new Error(
      "sweep ids were never resolved — beforeAll failed; its error is the real one",
    )
  }
  return ids[key]
}

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) {
    throw new Error(
      `${what} — the full sweep needs the seeded fixture; run scripts/run.sh mobile (it seeds) or scripts/seed.sh first`,
    )
  }
  return v
}

test.beforeAll(async () => {
  test.setTimeout(120_000)

  // The seeded public hackathon, discovered by name the way a user would.
  const listed = rpcAnonymous("hackathon.HackathonService/List", {
    visibilityFilter: 1,
  })
  if (!listed.ok) throw new Error(`HackathonService.List failed: ${listed.raw}`)
  const h1 = must(
    (
      listed.data.hackathons as { id: string; name: string }[] | undefined
    )?.find((h) => h.name === SEED_HACKATHONS.h1.name),
    `seed hackathon "${SEED_HACKATHONS.h1.name}" not found`,
  )

  // Real ids for every dynamic segment, from the entities the seed creates.
  const [projects, phases, tracks, pages] = await Promise.all([
    rpcAs("alice", "hackathon.ProjectService/List", { hackathonId: h1.id }),
    rpcAs("alice", "hackathon.PhaseService/List", { hackathonId: h1.id }),
    rpcAs("alice", "hackathon.TrackService/List", { hackathonId: h1.id }),
    rpcAs("alice", "hackathon.PageService/List", { hackathonId: h1.id }),
  ])
  const projectRows = (projects.data?.projects ?? []) as {
    id: string
    title: string
  }[]
  const approved = must(
    projectRows.find((p) => p.title === "AutoML Pipeline Builder"),
    "seed project 'AutoML Pipeline Builder' not found in h1",
  )
  const proposal = must(
    projectRows.find((p) => p.title === "Federated Learning Framework"),
    "seed proposal 'Federated Learning Framework' not found in h1",
  )
  const phase = must(
    (phases.data?.phases as { id: string }[] | undefined)?.[0],
    "h1 has no phases",
  )
  const track = must(
    (tracks.data?.tracks as { id: string }[] | undefined)?.[0],
    "h1 has no tracks",
  )
  const pageRow = must(
    (pages.data?.pages as { id: string }[] | undefined)?.[0],
    "h1 has no pages",
  )

  // ── State the fixture lacks, created for real (idempotently) ──

  // An invite link, so /invite/[token] renders the preview instead of 404.
  let invites = await rpcAs("alice", "hackathon.HackathonService/ListInvites", {
    hackathonId: h1.id,
  })
  let token = (
    invites.data?.invites as { token: string; revokedAt?: string }[] | undefined
  )?.find((i) => !i.revokedAt)?.token
  if (!token) {
    const created = await rpcAs(
      "alice",
      "hackathon.HackathonService/CreateInvite",
      { hackathonId: h1.id, note: "layout sweep" },
    )
    if (!created.ok) throw new Error(`CreateInvite failed: ${created.raw}`)
    invites = await rpcAs("alice", "hackathon.HackathonService/ListInvites", {
      hackathonId: h1.id,
    })
    token = (
      invites.data?.invites as { token: string; revokedAt?: string }[]
    ).find((i) => !i.revokedAt)?.token
  }

  // A registration form, so /register/[id] renders fields instead of 404.
  // Labels chosen long on purpose: label wrapping at 360 is part of what the
  // sweep is here to check.
  const form = await rpcAs(
    "alice",
    "hackathon.ConfigService/SetRegistrationForm",
    {
      hackathonId: h1.id,
      fields: [
        {
          key: "affiliation",
          label: "Affiliation / organisation",
          type: "text",
          required: true,
        },
        {
          key: "experience",
          label:
            "Tell us about your experience with machine learning and data engineering",
          type: "text",
          required: false,
        },
        {
          key: "tags",
          label: "Topics you want to work on (comma-separated)",
          type: "tags",
          required: false,
        },
        {
          key: "portfolio",
          label: "Portfolio or repository URL",
          type: "url",
          required: false,
        },
      ],
      consents: [
        {
          key: "conduct",
          label:
            "I accept the Code of Conduct and the event's photography policy",
          required: true,
        },
        {
          key: "newsletter",
          label: "Keep me posted about future SDSC hackathons",
          required: false,
        },
      ],
    },
  )
  if (!form.ok) throw new Error(`SetRegistrationForm failed: ${form.raw}`)

  // Vote categories in all three methods, so the voting page renders every
  // ballot shape (bob) and the full management surface (alice).
  const cats = await rpcAs("alice", "vote.VoteService/ListVoteCategories", {
    hackathonId: h1.id,
  })
  const existing = new Set(
    ((cats.data?.voteCategories ?? []) as { name: string }[]).map(
      (c) => c.name,
    ),
  )
  const wanted: { name: string; votingMethod: number; maxPoints?: number }[] = [
    { name: "Best Overall Project", votingMethod: 1 },
    { name: "Crowd Favourite (ranked)", votingMethod: 2 },
    { name: "Technical Excellence (points)", votingMethod: 3, maxPoints: 10 },
  ]
  for (const w of wanted) {
    if (existing.has(w.name)) continue
    const res = await rpcAs("alice", "vote.VoteService/CreateVoteCategory", {
      hackathonId: h1.id,
      name: w.name,
      description: "Created by the layout sweep so the ballot renders.",
      votingMethod: w.votingMethod,
      voterType: 1,
      ...(w.maxPoints ? { maxPoints: w.maxPoints } : {}),
    })
    if (!res.ok)
      throw new Error(`CreateVoteCategory ${w.name} failed: ${res.raw}`)
  }

  // Voting open, so bob's visit renders live ballot forms, not a closed notice.
  const settings = await rpcAs(
    "alice",
    "hackathon.HackathonService/EditSettings",
    {
      hackathonId: h1.id,
      votingEnabled: true,
    },
  )
  if (!settings.ok) throw new Error(`EditSettings failed: ${settings.raw}`)

  // A prize table, so /prizes prefills rows (the many-field form case).
  const prizes = await rpcAs("alice", "hackathon.PrizeService/Get", {
    hackathonId: h1.id,
  })
  if (((prizes.data?.prizes ?? []) as unknown[]).length === 0) {
    const set = await rpcAs("alice", "hackathon.PrizeService/Set", {
      hackathonId: h1.id,
      prizes: [
        { rank: 1, title: "Grand Prize — 5000 CHF and an SDSC mentorship" },
        { rank: 2, title: "Runner-up — 2000 CHF" },
        { rank: 3, title: "Third place — 1000 CHF" },
        { rank: 0, title: "Community Choice" },
      ],
    })
    if (!set.ok) throw new Error(`PrizeService.Set failed: ${set.raw}`)
  }

  ids = {
    h1: h1.id,
    approvedProject: approved.id,
    bobProposal: proposal.id,
    phase: phase.id,
    track: track.id,
    page: pageRow.id,
    inviteToken: must(token, "no usable invite token after CreateInvite"),
  }
})

// ─── The visit table ─────────────────────────────────────────────────────────
// pattern = the enumerated route (coverage is keyed on it); path() = a real
// URL for it. Personas: "anon" (no session), or a PersonaKey. In the smoke
// fixture ALICE OWNS H1 (journey differs — .claude/CLAUDE.md, "cast differs
// between suites"), bob is a confirmed member, admin holds the global role.

type Who = PersonaKey | "anon"

interface Visit {
  pattern: string
  persona: Who
  path: () => string
  /** Why this persona / this id — shows up in failure output. */
  note?: string
}

const VISITS: Visit[] = [
  // Public, anonymous.
  { pattern: "/", persona: "anon", path: () => "/" },
  { pattern: "/hackathon", persona: "anon", path: () => "/hackathon" },
  {
    pattern: "/hackathon/[id]",
    persona: "anon",
    path: () => `/hackathon/${id("h1")}`,
  },
  { pattern: "/[slug=sitepage]", persona: "anon", path: () => "/about" },
  {
    pattern: "/invite/[token]",
    persona: "anon",
    path: () => `/invite/${id("inviteToken")}`,
    note: "token minted in beforeAll",
  },

  // Signed-in platform pages.
  { pattern: "/dashboard", persona: "bob", path: () => "/dashboard" },
  { pattern: "/account", persona: "bob", path: () => "/account" },
  {
    pattern: "/hackathons/create",
    persona: "admin",
    path: () => "/hackathons/create",
    note: "needs global Admin or HackathonOrganizer",
  },
  {
    pattern: "/manage/pages",
    persona: "admin",
    path: () => "/manage/pages",
    note: "global Admin only",
  },
  {
    pattern: "/manage/users",
    persona: "admin",
    path: () => "/manage/users",
    note: "global Admin only",
  },
  {
    pattern: "/manage/gallery",
    persona: "admin",
    path: () => "/manage/gallery",
    note: "global Admin only — ALL_MEDIA scope",
  },
  {
    pattern: "/register/[id]",
    persona: "bob",
    path: () => `/register/${id("h1")}`,
    note: "form set in beforeAll",
  },

  // Member surfaces on h1 where the member view is the richer/only one.
  {
    pattern: "/my/hackathon/[id]/projects/proposals",
    persona: "bob",
    path: () => `/my/hackathon/${id("h1")}/projects/proposals`,
    note: "own pending proposals — bob has two, alice none",
  },
  {
    pattern: "/my/hackathon/[id]/projects/proposals/propose",
    persona: "bob",
    path: () => `/my/hackathon/${id("h1")}/projects/proposals/propose`,
  },
  {
    pattern: "/my/hackathon/[id]/projects/proposals/[projectId]/edit",
    persona: "bob",
    path: () =>
      `/my/hackathon/${id("h1")}/projects/proposals/${id("bobProposal")}/edit`,
    note: "author edits own proposal",
  },

  // Organizer/owner surfaces on h1 — alice sees every control.
  {
    pattern: "/my/hackathon/[id]/overview",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/overview`,
  },
  {
    pattern: "/my/hackathon/[id]/teams",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/teams`,
  },
  {
    pattern: "/my/hackathon/[id]/teams/manage",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/teams/manage`,
    note: "assignment board + people panel",
  },
  {
    pattern: "/my/hackathon/[id]/projects",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/projects`,
  },
  {
    pattern: "/my/hackathon/[id]/projects/[projectId]",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/projects/${id("approvedProject")}`,
  },
  {
    pattern: "/my/hackathon/[id]/projects/[projectId]/edit",
    persona: "alice",
    path: () =>
      `/my/hackathon/${id("h1")}/projects/${id("approvedProject")}/edit`,
  },
  {
    pattern: "/my/hackathon/[id]/timeline",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/timeline`,
  },
  {
    pattern: "/my/hackathon/[id]/timeline/new",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/timeline/new`,
  },
  {
    pattern: "/my/hackathon/[id]/timeline/[phaseId]/edit",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/timeline/${id("phase")}/edit`,
  },
  {
    pattern: "/my/hackathon/[id]/tracks",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/tracks`,
  },
  {
    pattern: "/my/hackathon/[id]/tracks/new",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/tracks/new`,
  },
  {
    pattern: "/my/hackathon/[id]/tracks/[trackId]/edit",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/tracks/${id("track")}/edit`,
  },
  {
    pattern: "/my/hackathon/[id]/pages",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/pages`,
  },
  {
    pattern: "/my/hackathon/[id]/pages/new",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/pages/new`,
  },
  {
    pattern: "/my/hackathon/[id]/pages/[pageId]",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/pages/${id("page")}`,
  },
  {
    pattern: "/my/hackathon/[id]/pages/[pageId]/edit",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/pages/${id("page")}/edit`,
  },
  {
    pattern: "/my/hackathon/[id]/participants",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/participants`,
    note: "owner sees approve/remove/role controls",
  },
  {
    pattern: "/my/hackathon/[id]/submissions",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/submissions`,
  },
  {
    pattern: "/my/hackathon/[id]/voting",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/voting`,
    note: "organizer view: category editor + tallies",
  },
  {
    pattern: "/my/hackathon/[id]/prizes",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/prizes`,
    note: "prize table set in beforeAll",
  },
  {
    pattern: "/my/hackathon/[id]/windows",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/windows`,
  },
  {
    pattern: "/my/hackathon/[id]/forms",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/forms`,
  },
  {
    pattern: "/my/hackathon/[id]/email",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/email`,
  },
  {
    pattern: "/my/hackathon/[id]/invites",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/invites`,
  },
  {
    pattern: "/my/hackathon/[id]/photos",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/photos`,
  },
  {
    pattern: "/my/hackathon/[id]/webinars",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/webinars`,
  },
  {
    pattern: "/my/hackathon/[id]/manage",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/manage`,
  },
  {
    pattern: "/my/hackathon/[id]/manage/edit",
    persona: "alice",
    path: () => `/my/hackathon/${id("h1")}/manage/edit`,
    note: "nested under manage — its only entry point is the hub's Edit details",
  },

  // Second visit where the member variant is a genuinely different surface:
  // bob gets the BALLOTS (three methods, forms live because voting is open),
  // where alice — organizers may not vote — gets the editor asserted above.
  {
    pattern: "/my/hackathon/[id]/voting",
    persona: "bob",
    path: () => `/my/hackathon/${id("h1")}/voting`,
    note: "member view: live ballots in all three methods",
  },
]

/**
 * Routes we deliberately do NOT visit, each with the reason. The coverage
 * test fails on any enumerated route that is in neither list, so adding a
 * route to the app forces a decision here.
 */
const UNCOVERED: { pattern: string; reason: string }[] = [
  {
    pattern: "/signin",
    reason:
      "the sign-in interstitial forwards itself to Keycloak about two seconds " +
      "after it renders — that IS the feature — so it cannot hold still for a " +
      "full-page screenshot, a dozen geometry probes and a scroll to the end of " +
      "the document. Every one of those checks would race the navigation and " +
      "fail (or, worse, pass against a half-unloaded page). Its render is " +
      "asserted with JavaScript disabled, where it does hold still, by " +
      "tests/smoke/23-login-destination.spec.ts — including a 360px visit with " +
      "header, main and footer present and no sideways overflow.",
  },
]

// ─── The sweep ───────────────────────────────────────────────────────────────

async function sweep(page: Page, name: string, screenshot?: string) {
  await page.waitForLoadState("networkidle").catch(() => {})
  // Evidence first, so it exists even when a check below fails.
  if (screenshot) {
    await page
      .screenshot({
        path: path.join(SHOTS, `${screenshot}.png`),
        fullPage: true,
      })
      .catch(() => {})
  }

  // Without a visible <main>, every content check below passes vacuously.
  await expect(
    page.locator("main"),
    `${name}: no <main> rendered`,
  ).toBeVisible()

  // Same argument for the footer, and it is not hypothetical: expectNoOverlap
  // and expectNoClippedText below RETURN EARLY when their scope is missing, so
  // the two "footer" iterations were measuring nothing at all on the 37 routes
  // that had no footer — the `(app)` group's layout never mounted AppFooter
  // after the route split. Presence is asserted here, before anything claims to
  // have inspected it; expectFooterOperable further down adds the hit test.
  await expect(
    page.locator("footer"),
    `${name}: no <footer> rendered — the footer is the only inbound link to ` +
      `/privacy, /terms and /about, and the chrome checks below silently skip ` +
      `a scope that is absent`,
  ).toBeVisible()

  await expectFitsViewport(page, name)

  // The chrome, held to the strict contract (nothing may overlap or truncate).
  for (const scope of ["header", "footer", BANNER]) {
    await expectNoOverlap(page, scope, name)
    await expectNoClippedText(page, scope, name)
  }

  // The page's own content. Two explicit relaxations, documented in
  // helpers/reflow.ts: full geometric containment is deliberate layering
  // (badges on covers, icons in inputs), and an ellipsis on an arbitrarily
  // long user string — or text inside an overflow-x:auto scroller — is a
  // design decision, not eaten text. Partial intersection and bare clipping
  // still fail.
  await expectNoOverlap(page, "main", name, { skipGeometricContainment: true })
  await expectNoClippedText(page, "main", name, {
    allowEllipsis: true,
    allowInsideHorizontalScroller: true,
  })

  // The footer's four links, hit-tested at the bottom of the document — the
  // only place they ever are. "Present" and "clickable" came apart twice: the
  // consent banner covered these exact links at every width while it was
  // `fixed`, and a viewport-anchored sidebar can cover them at any scroll
  // position. Scrolls and restores, like the check below it.
  await expectFooterOperable(page, name)

  // LAST, because it scrolls (and puts the page back). The checks above are
  // taken at the top of the page; this one is the only claim that depends on
  // where the document ends.
  //
  // Route coverage is the point of running it here rather than only in
  // chrome-reflow: whether a page trips over a banner drawn on top of it
  // depends entirely on where that page's controls sit, which is why one suite
  // passed the same wiring the journey died on. 42 routes × 2 widths asks the
  // question of every surface in the app.
  await expectConsentBannerClearsContent(page, name)
}

const PERSONA_ORDER: Who[] = ["anon", "bob", "alice", "admin"]

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: vp })

    for (const persona of PERSONA_ORDER) {
      const visits = VISITS.filter((v) => v.persona === persona)
      if (visits.length === 0) continue

      test.describe(persona, () => {
        test.use({
          storageState:
            persona === "anon"
              ? { cookies: [], origins: [] }
              : storageStatePath(persona),
        })

        for (const v of visits) {
          test(v.pattern, async ({ page }) => {
            const target = v.path()
            const name = `${vp.width}px ${v.pattern} as ${persona}${v.note ? ` (${v.note})` : ""}`

            const resp = await page.goto(target)
            expect(
              resp?.status() ?? 0,
              `${name}: ${target} answered ${resp?.status()} — an error page proves nothing about this route's layout; fix the reason it errors or declare the route UNCOVERED with that reason`,
            ).toBeLessThan(400)

            await sweep(
              page,
              name,
              vp.width === 360
                ? `${v.pattern.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home"}--${persona}`
                : undefined,
            )
          })
        }
      })
    }
  })
}

// ─── Coverage: the sweep visits what the app actually has ────────────────────

test("every route is swept or explicitly declared uncovered", () => {
  const routes = enumerateRoutes(ROUTES_DIR).sort()
  expect(
    routes.length,
    `route enumeration found ${routes.length} routes under ${ROUTES_DIR} — an empty result means the sweep is pointed at the wrong tree`,
  ).toBeGreaterThan(0)

  const visited = new Set(VISITS.map((v) => v.pattern))
  const declared = new Map(UNCOVERED.map((u) => [u.pattern, u.reason]))

  const unaccounted = routes.filter((r) => !visited.has(r) && !declared.has(r))
  expect(
    unaccounted,
    "routes the sweep neither visits nor declares uncovered — add a Visit " +
      "(with a real id source) or an UNCOVERED entry with the reason:\n  " +
      unaccounted.join("\n  "),
  ).toEqual([])

  // Stale entries are how a table rots into asserting nothing.
  const routeSet = new Set(routes)
  const staleVisits = [...visited].filter((p) => !routeSet.has(p))
  expect(
    staleVisits,
    `sweep entries for routes that no longer exist: ${staleVisits.join(", ")}`,
  ).toEqual([])
  const staleDeclared = [...declared.keys()].filter((p) => !routeSet.has(p))
  expect(
    staleDeclared,
    `UNCOVERED entries for routes that no longer exist: ${staleDeclared.join(", ")}`,
  ).toEqual([])
  const both = [...declared.keys()].filter((p) => visited.has(p))
  expect(
    both,
    `routes both visited and declared uncovered — delete the stale declaration: ${both.join(", ")}`,
  ).toEqual([])
})
