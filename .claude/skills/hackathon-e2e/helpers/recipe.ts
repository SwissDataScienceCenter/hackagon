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
import {
  rpcAnonymous,
  rpcAnonymousAsync,
  rpcAsUser,
  rpcAsUserAsync,
  ensureRegistered,
  getTokenFor,
  type RpcResult,
} from "./api.js"
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
  /** The element the selector names is VISIBLE (first match). For facts that
   * page-wide text cannot state unambiguously — a status badge inside one
   * card, when the same word appears in a filter dropdown. */
  expectSelector?: string
  /** No element matching the selector remains — "the control disappeared
   * because the action it offered is done" (an Approve button after approval,
   * an Unassign chip control after unassigning). This is the result-changed
   * assertion for clicks whose effect is REMOVAL. */
  expectGoneSelector?: string
  back?: boolean
}

/** One call inside an `rpc.race` action. */
export interface RaceCall {
  actor?: string
  method: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any
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
  action: "rpc" | "rpc.race" | "ui.assert" | "ui.flow" | "files.generate"
  method?: string
  assert?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any
  fresh?: boolean
  steps?: FlowStep[]
  /** rpc.race only: the calls fired SIMULTANEOUSLY (Promise.all over
   * separately spawned grpcurl processes). Everything else in the suite stays
   * strictly serial — the concurrency lives inside this one action. */
  calls?: RaceCall[]
  /** rpc.race only: the aggregate verdict. `ok` is the exact number of calls
   * that must succeed; `failCodesOneOf` lists the acceptable MULTISETS of
   * failure codes (order-insensitive) — more than one entry when which caller
   * loses is scheduler-dependent but the loser's code depends on who won.
   * Aggregate results are necessary, not sufficient: pair every race with a
   * follow-up rpc that reads the END STATE back ("both returned OK" and
   * "there is one row" are different claims). */
  race?: { ok: number; failCodesOneOf?: string[][] }
  save?: Record<string, string>
  expect?: {
    ok?: boolean
    error?: string
    /** With `error`: a case-insensitive regex the refusal's TEXT must match.
     * A status code says how the server refused, never what it refused about,
     * and two different faults answering the same code is exactly how a
     * re-specified action keeps passing while its `outcome` has become a lie —
     * `SetCapabilities` used to answer NotFound for a missing capability ROW
     * and now answers it for a missing HACKATHON, from the same request. */
    errorMatches?: string
    check?: string
    checkArgs?: unknown
    /** Succeed, OR fail with one of these codes — for restore steps whose
     * starting state depends on which racer won (e.g. demoting someone the
     * race may or may not have already demoted). */
    okOr?: string[]
  }
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

/**
 * Read recipe.jsonl into the action list the journey executes.
 *
 * The file holds two kinds of line: ACTIONS (they carry an `id`, and become
 * one test each) and act BANNERS (a lone `comment`, pure decoration for the
 * player and for anyone reading the file). The only honest way to tell them
 * apart is the `id` — an action is a thing that can be named and reported.
 *
 * This used to filter on `!("comment" in a)`, which is a property of banners
 * but NOT exclusive to them: `act8.flow.bob` carries a trailing `comment`
 * explaining why it runs where it does, so it was dropped and had never once
 * executed — 309 action lines, 308 tests, and nothing anywhere said so. The
 * invariants below make that specific silent-green shape impossible: a line
 * that is neither a banner nor an action, an action whose count disagrees with
 * an INDEPENDENT textual scan of the file, or two actions sharing an id all
 * throw at load time rather than quietly shortening the suite.
 */
export function loadRecipe(): RecipeAction[] {
  const file = path.join(SKILL_DIR, "recipe.jsonl")
  const lines = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  const parsed = lines.map((l, i) => {
    try {
      return JSON.parse(l) as Partial<RecipeAction>
    } catch (e) {
      throw new Error(`recipe.jsonl line ${i + 1} is not valid JSON: ${e}`)
    }
  })

  const isAction = (a: Partial<RecipeAction>): boolean =>
    typeof a.id === "string" && a.id.length > 0

  // Anything that is not an action must be an act banner. A line that is
  // neither is an action that lost its id — the one way this filter could
  // still drop real work without anyone noticing.
  parsed.forEach((a, i) => {
    if (!isAction(a) && !("comment" in a)) {
      throw new Error(
        `recipe.jsonl line ${i + 1} has no 'id' and no 'comment' — an action ` +
          `without an id cannot be reported, and would be silently dropped.`,
      )
    }
  })

  const actions = parsed.filter(isAction) as RecipeAction[]

  // Cross-check against a scan of the RAW text, not of `parsed`: if the
  // predicate above ever drifts again, the two counts disagree and the suite
  // fails loudly instead of running fewer tests.
  const textualIdLines = lines.filter((l) => /(^|[{,])\s*"id"\s*:/.test(l)).length
  if (actions.length !== textualIdLines) {
    throw new Error(
      `recipe.jsonl: loaded ${actions.length} actions but ${textualIdLines} lines ` +
        `carry an "id". loadRecipe() is dropping real actions — fix the filter, ` +
        `do not adjust this check.`,
    )
  }

  // One test is generated per id; duplicates would report as one action having
  // run when two were written.
  const seen = new Set<string>()
  for (const a of actions) {
    if (seen.has(a.id)) throw new Error(`recipe.jsonl: duplicate action id '${a.id}'`)
    seen.add(a.id)
  }

  return actions
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
    // `displayName`, not `name`: the User proto has no `name` field, so the
    // original read of `u.name` mapped every user to undefined and the
    // not-toContain below passed no matter who was still in the list — the
    // deletion assertion was vacuously green. The guard makes that shape
    // impossible: if the field ever moves again, the check throws instead of
    // agreeing with everything.
    const names = (data.users ?? []).map(
      (u: { displayName?: string }) => u.displayName,
    )
    expect(
      names.filter(Boolean).length,
      "no user in the list has a displayName — the field this check reads has moved",
    ).toBeGreaterThan(0)
    for (const n of args.names as string[]) {
      expect(names, `deleted profile '${n}' must not appear in the user list`).not.toContain(n)
    }
  },
  /** ExportVotes(JSON) → exactly N ballot rows. The race's end-state read:
   * bytes come back base64-encoded on the grpcurl wire. */
  exportBallotCount(data, args) {
    const rows = JSON.parse(
      Buffer.from((data.data ?? "") as string, "base64").toString("utf8"),
    ) as { voter_id: string }[]
    expect(
      rows,
      `expected exactly ${args.count} ballot row(s) in the category`,
    ).toHaveLength(args.count)
    if (args.oneVoter) {
      expect(new Set(rows.map((r) => r.voter_id)).size).toBeLessThanOrEqual(1)
    }
  },
  /** The stored record deep-equals exactly ONE of the candidate payloads —
   * last-writer-wins is the pinned semantics; a field-mix of two concurrent
   * writers is the lost-update corruption this exists to catch. */
  templatesOneOf(data, args) {
    const stored = data.templates ?? {}
    const matches = (args.candidates as Record<string, string>[]).filter(
      (c) => JSON.stringify(sortKeys(c)) === JSON.stringify(sortKeys(stored)),
    )
    expect(
      matches.length,
      `stored templates are a MIX of concurrent writes (or neither write landed): ${JSON.stringify(stored)}`,
    ).toBe(1)
  },
  /** Roster roles by username — the element that states the fact, not the row
   * around it. */
  memberRoles(data, args) {
    const members: { user?: { username?: string }; role?: string }[] =
      data.hackathon.members ?? []
    for (const [username, role] of Object.entries(
      args.roles as Record<string, string>,
    )) {
      const m = members.find((x) => x.user?.username === username)
      expect(m, `no roster row for '${username}'`).toBeTruthy()
      expect(m?.role, `role of '${username}'`).toBe(role)
    }
  },
  /** The number of Owners on the roster — the invariant the last-organizer
   * guard exists for is "never zero", and a concurrent mutual demotion is the
   * way it broke. */
  ownerCount(data, args) {
    const members: { role?: string }[] = data.hackathon.members ?? []
    const owners = members.filter((m) => m.role === "HACKATHON_ROLE_OWNER")
    expect(owners, `expected exactly ${args.count} owner(s) on the roster`).toHaveLength(
      args.count,
    )
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
  /** Join's answer says WHERE the caller landed — a confirmed place, or the
   * waiting queue and at what position. Joining a full event succeeds, so
   * "ok" alone proves nothing about which of the two happened; this does.
   * Proto3 omits false/0 on the grpcurl wire, hence the ?? defaults. */
  joinOutcome(data, args) {
    expect(Boolean(data.waitlisted), "waitlisted flag").toBe(args.waitlisted)
    if (args.position !== undefined) {
      expect(data.queuePosition ?? 0, "queue position").toBe(args.position)
    }
  },
  /** The capacity field as Edit/Get echo it back; 0 asserts "unlimited"
   * (proto3 omits the optional field entirely then). */
  capacityField(data, args) {
    expect(data.hackathon.maxParticipants ?? 0, "max_participants").toBe(args.value)
  },
  votingWinner() {
    throw new Error(
      "TODO: implement the 'votingWinner' check in helpers/recipe.ts against the final VoteService.Results response shape.",
    )
  },
  /**
   * `StorageService.ListObjects` — what came back, and whether the cursor moved.
   *
   * `keyPrefix` refuses to run against an empty list: "every key sits under
   * hackathons/<id>/" is true of no keys at all, and a scope that answered with
   * nothing would then read as a passing containment check.
   */
  objectsListed(data, args) {
    const objects: { key?: string }[] = data.objects ?? []
    if (args.count !== undefined) {
      expect(objects, `expected exactly ${args.count} object(s)`).toHaveLength(args.count)
    }
    if (args.atLeast !== undefined) {
      expect(
        objects.length,
        `expected at least ${args.atLeast} object(s) in this scope`,
      ).toBeGreaterThanOrEqual(args.atLeast)
    }
    if (args.keyPrefix !== undefined) {
      expect(
        objects.length,
        "no objects came back, so the prefix check below would be vacuous",
      ).toBeGreaterThan(0)
      for (const o of objects) {
        expect(o.key ?? "", "a listing must not leak keys outside its scope").toContain(
          args.keyPrefix,
        )
      }
    }
    if (args.keyNot !== undefined) {
      for (const o of objects) {
        expect(o.key, "the cursor did not advance past the first page").not.toBe(args.keyNot)
      }
    }
    if (args.hasNextToken !== undefined) {
      expect(
        Boolean(data.nextPageToken),
        `next_page_token present? (got ${JSON.stringify(data.nextPageToken)})`,
      ).toBe(args.hasNextToken)
    }
  },
  /**
   * The current-phase MARKER, as the hackathon stores it.
   *
   * A declaration and a phase that merely covers today are different facts —
   * only the first can be cleared — so this reads `current_phase_id` itself
   * rather than asking which phase is live.
   */
  currentPhase(data, args) {
    const id: string = data.hackathon.currentPhaseId ?? ""
    if (args.declared === false) {
      expect(id, "no phase should be declared current").toBe("")
    }
    if (args.declared === true) {
      expect(id, "a phase should be declared current").not.toBe("")
    }
    if (args.equals !== undefined) expect(id).toBe(args.equals)
  },
  /** `PageService.List` sorts by `order` server-side — this is that order. */
  pageOrder(data, args) {
    const titles = (data.pages ?? []).map((p: { title: string }) => p.title)
    expect(titles, "the stored page order").toEqual(args.titles)
  },
  /** Team membership by display name, per team. The end-state read an import
   *  owes: "Applied 1 of 1" and "she is on that team" are different claims. */
  teamComposition(data, args) {
    const teams: { name?: string; members?: { displayName?: string; username?: string }[] }[] =
      data.teams ?? []
    for (const [name, members] of Object.entries(
      args.teams as Record<string, string[]>,
    )) {
      const t = teams.find((x) => x.name === name)
      expect(t, `no team named '${name}' (got ${teams.map((x) => x.name).join(", ")})`).toBeTruthy()
      const got = (t?.members ?? [])
        .map((m) => m.displayName || m.username)
        .sort()
      expect(got, `members of '${name}'`).toEqual([...members].sort())
    }
  },
  /**
   * Capability rows as `Hackathon.Get` resolves them — by NAME, so a check reads
   * as the four states the panel has to tell apart rather than as enum numbers.
   */
  capabilityStates(data, args) {
    // Either shape: `Get` nests them under the hackathon, `SetCapabilities`
    // answers with the list itself. A check that only knew one crashed with
    // "cannot read properties of undefined" against the other.
    const rows: { capability?: string; state?: string }[] =
      data.hackathon?.capabilities ?? data.capabilities ?? []
    expect(
      rows.length,
      "the hackathon reports no capability rows at all — every state check below would be vacuous",
    ).toBeGreaterThan(0)
    for (const [name, state] of Object.entries(args.states as Record<string, string>)) {
      const row = rows.find((r) => r.capability === name)
      expect(row, `no capability row for '${name}'`).toBeTruthy()
      expect(row?.state, `state of '${name}'`).toBe(state)
    }
  },
  /**
   * A stored page's own body, found by title in a `PageService.List` answer.
   *
   * By title rather than by a saved id, because the page this reads back was
   * authored through the EDITOR — the recipe never saw an id for it, and that is
   * the point: what the browser saved is what the server now holds.
   */
  pageContent(data, args) {
    const pages: { title?: string; content?: string }[] = data.pages ?? []
    const p = pages.find((x) => x.title === args.title)
    expect(
      p,
      `no page titled '${args.title}' (got ${pages.map((x) => x.title).join(", ")})`,
    ).toBeTruthy()
    const body = p?.content ?? ""
    expect(body, "the page came back empty").not.toBe("")
    for (const s of args.contains as string[]) {
      expect(body, `saved page content must contain ${JSON.stringify(s)}`).toContain(s)
    }
  },
}

function sortKeys(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
}

// ─── Named UI assertions (`ui.assert`) ───────────────────────────────────────
// Unknown names skip with the action's TODO — implement them here when the
// corresponding page renders real data.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UiAssert = (page: Page, args: any, browser: Browser) => Promise<void>

/** The hackathon an assertion is about: an explicit id, else the journey's own. */
function requireHackathonId(args: { hackathonId?: string }): string {
  const id = args.hackathonId ?? vars.get("hackathonId")
  if (!id) throw new MissingVar("hackathonId")

  return id
}

/**
 * The tile grid on the manage hub — NOT the page.
 *
 * The sidebar renders the same ten labels on this very page and lives inside
 * `<main>` too, so a page-wide `getByRole("link", {name: "Manage Tracks"})` is
 * satisfied by the nav alone: it would pass with the tile grid missing
 * entirely, which is the one thing these assertions are for. Reached through
 * the `<span class="meta">Manage</span>` that introduces the grid, because
 * `SidebarNavSection` renders its own heading in a `div` and never in a
 * `<section>`.
 */
function manageTiles(page: Page): Locator {
  return page
    .locator("main section")
    .filter({ has: page.getByText("Manage", { exact: true }) })
}

/**
 * The Now or Next box on the manage hub, reached from the label it carries.
 *
 * `ancestor::…[1]` rather than a fixed number of `..` hops: "Now" shares a line
 * with the Declared/By-dates badge and therefore sits one level deeper than
 * "Next", so a fixed walk lands on the card for one of them and on the grid for
 * the other. `card-raised` is a design-system primitive defined in the theme,
 * not an ad-hoc utility list.
 */
function phaseCard(page: Page, which: "Now" | "Next"): Locator {
  return page
    .getByText(which, { exact: true })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'card-raised')][1]")
}

/** The organiser's capability panel. A `<section>` with an accessible name is a
 *  region, so the panel names itself and no class list is involved. */
function capabilityPanel(page: Page): Locator {
  return page.getByRole("region", { name: "What participants can do" })
}

/**
 * One capability's row inside that panel, and the BADGE that states its state.
 *
 * The row is only ever used to SELECT — every assertion below reads the badge,
 * which is the one element that says which of the four states we are in. The
 * row also carries the label, the description and the state note, so asserting
 * on it would be the container-contains-its-own-answer bug this repo has shipped
 * three times.
 */
function capabilityRow(page: Page, label: string): Locator {
  // `has:` is built from `page`, NEVER from the panel. Playwright re-roots an
  // inner locator at each candidate element, keeping its whole selector chain —
  // so `has: panel.getByText(…)` looks for the PANEL inside a `<label>`, matches
  // nothing, and reports "element(s) not found" about the badge.
  return capabilityPanel(page)
    .locator("label")
    .filter({ has: page.getByText(label, { exact: true }) })
}

/** The people panel's membership badge on the team board — the element that
 *  STATES which team someone is on ("Unassigned" when none). */
function personTeamBadge(page: Page, name: string): Locator {
  return content(page)
    .locator("aside li")
    .filter({ hasText: name })
    .locator("span.badge")
    .first()
}

/** One row of the Manage Pages list, selected by the title it states. */
function pageRow(page: Page, title: string): Locator {
  return content(page)
    .locator("[data-page-row]")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
}

/** A file the page's `<input type=file>` will accept, from a recipe param. */
function uploadFile(f: { name: string; body: string; mimeType?: string }) {
  return {
    name: f.name,
    mimeType: f.mimeType ?? "text/csv",
    buffer: Buffer.from(f.body, "utf8"),
  }
}

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
  /**
   * The home row RENDERS the cover it was passed — pixels, not markup. List
   * rows once accepted a `logo` prop and never mounted it, and every suite
   * stayed green because they all asserted on text. `naturalWidth > 0` is the
   * browser saying image bytes actually arrived and decoded.
   */
  async homeRowCover(page, args) {
    await page.goto("/")
    const row = homeRow(page, args.name)
    await expect(row).toBeVisible()
    const img = row.locator("img").first()
    await expect(img, "the row was given a cover and rendered no <img>").toBeVisible()
    await expect
      .poll(
        () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth),
        { message: "the cover <img> decoded to zero pixels (broken src?)" },
      )
      .toBeGreaterThan(0)
  },
  /**
   * A gallery upload actually SERVES: presign → PUT the bytes → GET them back,
   * every hop through the frontend server the suite runs against. The presign
   * RPC succeeded for months while `/objects` 404'd on the adapter-node build,
   * so the upload went nowhere and no uploaded image ever loaded — this is the
   * round trip that would have turned red.
   */
  async mediaUploadRoundTrip(page, args) {
    const id = vars.get("hackathonId")
    if (!id) throw new MissingVar("hackathonId")
    const png = generateLogoPng(args.seed ?? 2029)
    const presign = await rpcAsUser(
      credsFor("hackagon-admin"),
      "storage.StorageService/CreateUploadUrl",
      {
        kind: "UPLOAD_KIND_HACKATHON_MEDIA",
        ownerId: id,
        filename: (args.filename as string) ?? "gallery.png",
        contentType: "image/png",
        sizeBytes: png.length,
      },
    )
    expect(presign.ok, `CreateUploadUrl failed: ${presign.raw}`).toBe(true)
    const uploadUrl: string = presign.data.uploadUrl
    const publicUrl: string = presign.data.publicUrl
    expect(uploadUrl, "presign returned no uploadUrl").toBeTruthy()
    expect(publicUrl, "presign returned no publicUrl").toBeTruthy()

    const put = await page.request.put(uploadUrl, {
      data: png,
      headers: { "content-type": "image/png" },
    })
    expect(
      put.status(),
      `PUT ${uploadUrl} answered ${put.status()} — the /objects path is not being served`,
    ).toBe(200)

    const get = await page.request.get(publicUrl)
    expect(
      get.status(),
      `GET ${publicUrl} answered ${get.status()} — the uploaded object does not load`,
    ).toBe(200)
    const body = await get.body()
    expect(body.length, "the served object is not the uploaded bytes").toBe(png.length)
  },
  /** The participants page states how full a capped event is — the number an
   * organizer approves against. Takes the hackathon id via args (resolved
   * {{var:...}}) because the capacity plot runs on its own event, not the
   * journey's main one. Texts must be VISIBLE: this is the surface that makes
   * approving past capacity a decision rather than an accident. */
  async capacityGauge(page, args) {
    await page.goto(`/my/hackathon/${args.hackathonId as string}/participants`)
    for (const text of args.textContains as string[]) {
      await expect(visibleText(content(page), text).first()).toBeVisible()
    }
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

  /**
   * The manage hub: the tiles it derives from `manageNav`, the Now/Next box and
   * its single action, and the two links that exist only when they mean
   * something (Review N waiting; Edit details).
   *
   * Every fact is read off the element that states it — a tile's own `href`, the
   * Now card's heading, the Declared/By-dates badge, the action button's label.
   * The label is the whole point of that button: all three cases post the same
   * `AdvancePhase`, and "Advance to X" as a single wording collapsed
   * declare-the-live-one and start-the-first-one into a sentence that named
   * neither.
   */
  async manageHub(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/manage`)
    await expect(
      page.getByRole("heading", { name: "Manage Hackathon", exact: true }),
    ).toBeVisible()

    const tiles = manageTiles(page)
    for (const tile of (args.tiles ?? []) as { label: string; href: string }[]) {
      const link = tiles.getByRole("link", { name: tile.label, exact: true })
      await expect(link, `no tile named '${tile.label}' in the Manage grid`).toHaveCount(1)
      await expect(
        link,
        `the '${tile.label}' tile does not lead to ${tile.href}`,
      ).toHaveAttribute("href", new RegExp(`${tile.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
    }
    if (args.tileCount !== undefined) {
      await expect(
        tiles.getByRole("link"),
        "the hub renders one tile per manageNav entry except its own",
      ).toHaveCount(args.tileCount)
    }
    // Its own entry is deliberately NOT among the tiles: a tile linking to the
    // page you are on is the dead-link bug the nav already fixed once.
    await expect(
      tiles.getByRole("link", { name: "Manage Hackathon", exact: true }),
      "the hub must not tile itself",
    ).toHaveCount(0)

    const review = page.getByRole("link", { name: /^Review \d+ waiting$/ })
    if (args.reviewWaiting !== undefined) {
      const named = page.getByRole("link", {
        name: `Review ${args.reviewWaiting} waiting`,
        exact: true,
      })
      await expect(named, "the approval queue prompt states its count").toBeVisible()
      await expect(named).toHaveAttribute("href", /\/participants$/)
    } else {
      // Absence, with the tiles above as the positive control that the page
      // rendered at all: nobody is waiting, so this is a prompt and not a
      // permanent readout showing zero.
      await expect(
        review,
        "nobody is waiting, so no review prompt should be offered",
      ).toHaveCount(0)
    }

    const edit = page.getByRole("link", { name: "Edit details", exact: true })
    if (args.mayEdit === false) {
      await expect(edit, "a viewer who may not edit is offered no edit link").toHaveCount(0)
    } else {
      await expect(edit).toBeVisible()
      await expect(edit).toHaveAttribute("href", /\/manage\/edit$/)
    }

    const now = phaseCard(page, "Now")
    if (args.now) {
      await expect(now.getByRole("heading"), "the Now card names the live phase").toHaveText(
        args.now as string,
      )
    } else {
      await expect(
        now.getByText("Nothing running", { exact: true }),
        "no phase covers today and none is declared",
      ).toBeVisible()
    }
    if (args.nowBadge) {
      await expect(
        now.locator("span.badge"),
        "declared by an organiser, or merely running by the calendar",
      ).toHaveText(args.nowBadge as string)
    }
    if (args.nowBadge === null) {
      await expect(
        now.locator("span.badge"),
        "with nothing running there is no declared/by-dates distinction to draw",
      ).toHaveCount(0)
    }

    const next = phaseCard(page, "Next")
    if (args.next) {
      await expect(next.getByRole("heading")).toHaveText(args.next as string)
    } else if (args.next === null) {
      await expect(next.getByText("Nothing after this", { exact: true })).toBeVisible()
    }

    if (args.phaseAction) {
      await expect(
        page.getByRole("button", { name: args.phaseAction as string, exact: true }),
        "the one phase action, named for what it actually does",
      ).toBeVisible()
    } else if (args.phaseAction === null) {
      await expect(
        page.getByRole("button", { name: /^(Advance to|Declare|Start) / }),
        "with no phases there is nothing to advance to",
      ).toHaveCount(0)
    }
    if (args.clearMarker !== undefined) {
      await expect(
        page.getByRole("button", { name: "Clear the marker", exact: true }),
        "clearing is only offered against an actual declaration",
      ).toHaveCount(args.clearMarker ? 1 : 0)
    }
  },

  /**
   * The hub's phase action, clicked — one label at a time, asserting the state
   * that CHANGED after each.
   *
   * `steps` is a list of `{click, then}`: the button to press and what the box
   * must say afterwards. Written as one action rather than three because the
   * three cases are a sequence — you cannot reach "Advance to X" without first
   * declaring something — and each click is judged on the box, never on "the
   * POST returned 200".
   */
  async managePhaseAdvance(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/manage`)

    for (const step of args.steps as {
      click: string
      now?: string
      nowBadge?: string
      next?: string | null
      action?: string | null
    }[]) {
      await page
        .getByRole("button", { name: step.click, exact: true })
        .click()
      // The form POST re-renders the page; every assertion below auto-retries,
      // so the state is read after the round trip rather than after a sleep.
      if (step.now !== undefined) {
        await expect(
          phaseCard(page, "Now").getByRole("heading"),
          `after '${step.click}' the Now card should name ${step.now}`,
        ).toHaveText(step.now)
      }
      if (step.nowBadge !== undefined) {
        await expect(
          phaseCard(page, "Now").locator("span.badge"),
          `after '${step.click}' the marker should read ${step.nowBadge}`,
        ).toHaveText(step.nowBadge)
      }
      if (step.next !== undefined) {
        if (step.next === null) {
          await expect(
            phaseCard(page, "Next").getByText("Nothing after this", { exact: true }),
          ).toBeVisible()
        } else {
          await expect(phaseCard(page, "Next").getByRole("heading")).toHaveText(step.next)
        }
      }
      if (step.action !== undefined) {
        if (step.action === null) {
          await expect(
            page.getByRole("button", { name: /^(Advance to|Declare|Start) / }),
            `after '${step.click}' no phase action should remain`,
          ).toHaveCount(0)
        } else {
          await expect(
            page.getByRole("button", { name: step.action, exact: true }),
            `after '${step.click}' the next action should be '${step.action}'`,
          ).toBeVisible()
        }
      }
    }
  },

  /**
   * The FLAT Manage nav: every organiser entry sits on the rail directly, with
   * no disclosure to open, and the rail does not change when you walk into the
   * section.
   *
   * ⚠ Re-specified 2026-08-14, and it used to pin the exact OPPOSITE — the
   * section started folded behind a "Show Manage Hackathon pages" chevron,
   * toggled, remembered the choice per browser, and self-opened on a page inside
   * itself. develop's `942b60a7` removed the fold: because entering the section
   * force-opened it, the disclosure was already open everywhere an organiser
   * actually used it, while the sidebar's height still depended on a state
   * nothing on the page announced. Both branches watched that same force-open
   * and drew opposite conclusions from it; develop owns the product decision, so
   * the action is re-specified to it rather than deleted. The id stays
   * `act5.nav.fold` — it is the stable reference the run report joins on, and a
   * fold returning is what should turn this red.
   *
   * The load-bearing claim is the EQUALITY of the rail outside and inside
   * Manage. "The links are there" passes against a fold too, once it is open,
   * and the fold this replaced opened itself on exactly the pages a presence
   * check would have looked at — so a per-page presence assertion could never
   * have told the two designs apart.
   *
   * `getByRole` for the disclosure, not CSS: the folded entries stayed in the
   * DOM and were hidden with `inert` + `aria-hidden`, so the accessibility tree
   * was the only place that ever read as hidden.
   */
  async sidebarManageFold(page, args) {
    const id = requireHackathonId(args)
    const entryName = args.entry as string
    const insidePath = (args.insidePath as string) ?? "tracks"

    // Every entry the rail draws, by its own text. Sorted, because this is a
    // claim about the SET — reordering is `manageNav`'s business and has its own
    // fix history (develop's 4dc83705 undid an accidental swap).
    const railNames = async () =>
      (await page.locator("aside nav a").allInnerTexts()).map((t) => t.trim()).sort()

    await page.goto(`/my/hackathon/${id}/overview`)

    const hub = page.getByRole("link", { name: "Manage Hackathon", exact: true })
    const entry = page.getByRole("link", { name: entryName, exact: true })

    await expect(
      hub,
      "the hub names the section and is on the rail — it is how the section is entered",
    ).toBeVisible()
    await expect(
      entry,
      `'${entryName}' must be reachable from a PARTICIPANT page with nothing to open first`,
    ).toBeVisible()

    // The two above are this one's positive control: with the section proven
    // present, a zero here reads as "there is no disclosure" and not as "there
    // is no nav" — which is the shape an absence assertion agrees with
    // otherwise.
    await expect(
      page.getByRole("button", { name: /^(Show|Hide) .+ pages$/ }),
      "flat means no disclosure at all — a chevron here is the fold coming back",
    ).toHaveCount(0)

    const outside = await railNames()
    expect(
      outside.length,
      "the rail has to have entries before comparing two copies of it",
    ).toBeGreaterThan(1)
    expect(outside, "the hub is one of them").toContain("Manage Hackathon")

    await page.goto(`/my/hackathon/${id}/${insidePath}`)
    await expect(entry, "and still reachable from inside the section").toBeVisible()

    expect(
      await railNames(),
      "the rail must be identical inside Manage and outside it — that equality IS " +
        "'flat', and it is what a fold, which by construction differs between the two, " +
        "cannot satisfy",
    ).toEqual(outside)
  },

  /**
   * The capability panel, one badge at a time.
   *
   * This panel exists because three of the four states used to render as the
   * same unticked box, so the assertion that matters is that the badges DIFFER:
   * `distinctAtLeast` fails a build that has gone back to one word for
   * everything, which is precisely the shape no per-row expectation can catch on
   * its own (each row would still "match" if every row matched).
   *
   * `states` compares exact badge text; `statePatterns` compares a regex, for
   * COMING — whose badge is a DATE ("Opens 14 Aug"), and that date being there
   * is the whole reason COMING is a state of its own rather than a flavour of
   * closed.
   */
  async capabilityPanel(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/manage`)
    const panel = capabilityPanel(page)
    await expect(panel, "the capability panel did not render").toBeVisible()

    for (const [label, state] of Object.entries(
      (args.states ?? {}) as Record<string, string>,
    )) {
      await expect(
        capabilityRow(page, label).locator("span.badge"),
        `the state badge for '${label}'`,
      ).toHaveText(state)
    }
    for (const [label, pattern] of Object.entries(
      (args.statePatterns ?? {}) as Record<string, string>,
    )) {
      await expect(
        capabilityRow(page, label).locator("span.badge"),
        `the state badge for '${label}' should match /${pattern}/`,
      ).toHaveText(new RegExp(pattern))
    }
    // The checkbox reflects the STORED FLAG, which is a different fact from the
    // resolved state — that difference is all of UNGOVERNED and half of COMING.
    for (const [label, checked] of Object.entries(
      (args.checked ?? {}) as Record<string, boolean>,
    )) {
      const box = capabilityRow(page, label).locator("input[type=checkbox]")
      if (checked) await expect(box, `'${label}' box ticked`).toBeChecked()
      else await expect(box, `'${label}' box unticked`).not.toBeChecked()
    }

    const badges = await panel.locator("label span.badge").allTextContents()
    expect(
      badges.length,
      "the panel rendered no state badges — every expectation above would be vacuous",
    ).toBeGreaterThan(0)
    const distinct = new Set(badges.map((b) => b.trim()))
    expect(
      distinct.size,
      `the panel is showing ${distinct.size} distinct state(s) (${[...distinct].join(" | ")}) — ` +
        `it must tell the four apart, and one word for everything is the bug it was built for`,
    ).toBeGreaterThanOrEqual((args.distinctAtLeast as number) ?? 2)

    if (args.absentStates) {
      for (const state of args.absentStates as string[]) {
        expect(
          [...distinct],
          `no capability should read '${state}' here`,
        ).not.toContain(state)
      }
    }
    if (args.ungovernedWarning !== undefined) {
      await expect(
        panel.getByText("no stored setting on this hackathon", { exact: false }),
        "the save-will-be-refused warning",
      ).toHaveCount(args.ungovernedWarning ? 1 : 0)
    }
  },

  /**
   * The panel's own form: tick, untick, Save changes — then read the badges
   * back.
   *
   * Unchecked boxes submit NOTHING, so the six are rebuilt from the enum order
   * server-side; a save that dropped that would look identical on screen until
   * the badges are re-read, which is what the `after` half does.
   */
  async capabilitySave(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/manage`)
    const panel = capabilityPanel(page)

    for (const label of (args.uncheck ?? []) as string[]) {
      await capabilityRow(page, label).locator("input[type=checkbox]").uncheck()
    }
    for (const label of (args.check ?? []) as string[]) {
      await capabilityRow(page, label).locator("input[type=checkbox]").check()
    }
    await panel.getByRole("button", { name: "Save changes", exact: true }).click()
    // The line that STATES the save landed — not `getByRole("status")`, which
    // this panel can legitimately have three of (saved, ungoverned, unmet).
    await expect(
      panel.getByText("Saved.", { exact: true }),
      "the panel confirms the save",
    ).toBeVisible()

    for (const [label, state] of Object.entries(
      (args.after ?? {}) as Record<string, string>,
    )) {
      await expect(
        capabilityRow(page, label).locator("span.badge"),
        `after saving, '${label}' should read ${state}`,
      ).toHaveText(state)
    }

    if (args.reload) {
      // What anyone does next: a refresh. The badges after a POST are rendered
      // from the action's own answer; these are rendered from the database.
      await page.reload()
      for (const [label, state] of Object.entries(
        (args.after ?? {}) as Record<string, string>,
      )) {
        await expect(
          capabilityRow(page, label).locator("span.badge"),
          `after a refresh, '${label}' should still read ${state}`,
        ).toHaveText(state)
      }
      await expect(
        capabilityPanel(page).getByText("Saved.", { exact: true }),
        "the confirmation belongs to the save, not to the page — a refresh must drop it",
      ).toHaveCount(0)
    }
  },

  /**
   * The plan-vs-reality warning, and its one click.
   *
   * The gap is deliberate — nothing closes it automatically — so the warning has
   * to NAME the phase and the capabilities, and the button has to switch on only
   * what is missing. `untouched` is the additive half: something already closed
   * that the phase does not name must still be closed afterwards.
   */
  async capabilityEnableUnmet(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/manage`)
    const panel = capabilityPanel(page)
    const warning = panel.locator("div[role=status]").filter({ hasText: "is meant to include" })

    // WHICH of the two meanings of "current" is in play, read off the badge
    // that states it rather than assumed from the story so far. The button
    // below used to work only against a DECLARED phase while the warning was
    // drawn for either — so an action that clicks it without pinning the
    // resolution proves nothing about the case that was broken, and would go on
    // passing if a declaration leaked in from an earlier step.
    if (args.nowBadge) {
      await expect(
        phaseCard(page, "Now").locator("span.badge"),
        "the Now card must state this is the resolution under test",
      ).toHaveText(args.nowBadge as string)
    }

    await expect(warning, "the mismatch warning did not render").toBeVisible()
    await expect(warning, "it must name the phase whose plan is unmet").toContainText(
      args.phase as string,
    )
    for (const name of args.names as string[]) {
      await expect(warning, "and what participants cannot do yet").toContainText(name)
    }

    await warning.getByRole("button", { name: args.button as string, exact: true }).click()
    for (const [label, state] of Object.entries(
      (args.after ?? {}) as Record<string, string>,
    )) {
      await expect(
        capabilityRow(page, label).locator("span.badge"),
        `after 'Enable', '${label}' should read ${state}`,
      ).toHaveText(state)
    }
    for (const [label, state] of Object.entries(
      (args.untouched ?? {}) as Record<string, string>,
    )) {
      await expect(
        capabilityRow(page, label).locator("span.badge"),
        `'${label}' is not named by the phase, so enabling must have left it ${state}`,
      ).toHaveText(state)
    }
    await expect(
      warning,
      "with nothing unmet the warning has nothing to say and should be gone",
    ).toHaveCount(0)
  },

  /**
   * The platform media library: the tiles state WHAT each picture is and WHICH
   * event it came from, on their own elements (`data-testid`), never on the card
   * — the card also carries the same words in its alt text and its link.
   */
  async galleryShows(page, args) {
    await page.goto("/manage/gallery")
    await expect(page.getByRole("heading", { name: "Media library" })).toBeVisible()

    const origins = page.locator("[data-testid=image-origin]")
    expect(
      await origins.count(),
      "the gallery lists nothing — the assertions below would be vacuous",
    ).toBeGreaterThan(0)
    for (const label of (args.origins ?? []) as string[]) {
      await expect(
        origins.filter({ hasText: label }).first(),
        `no tile states it is '${label}'`,
      ).toBeVisible()
    }
    if (args.eventName) {
      await expect(
        page.locator("[data-testid=image-event]").filter({ hasText: args.eventName as string }).first(),
        "a tile must name the event its picture belongs to",
      ).toBeVisible()
    }
    if (args.absent) {
      for (const label of args.absent as string[]) {
        await expect(
          origins.filter({ hasText: label }),
          `${label} is deliberately not listable`,
        ).toHaveCount(0)
      }
    }
  },

  /**
   * The image picker's two halves, from the editor that mounts it.
   *
   * Both are asserted, and each half's ABSENCE is asserted while the other is
   * showing: the chips are the only thing distinguishing "the gallery is empty"
   * from "the gallery tab never rendered", and a picker that showed the upload
   * box under both chips would have looked fine from either one alone.
   */
  async imagePicker(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/${args.path ?? "pages/new"}`)
    const field = page.locator(`textarea#${args.field ?? "page-content"}`)
    await page.getByRole("button", { name: "Insert image", exact: true }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    const dropZone = dialog.getByRole("region", {
      name: "Drop an image here to upload it",
    })
    const fileInput = dialog.getByLabel("Choose an image file to insert")

    if (args.halves !== false) {
      await expect(dropZone, "the upload half is what opens first").toBeVisible()
      await expect(
        fileInput,
        "and the keyboard path into it is a labelled file input",
      ).toBeAttached()

      await dialog.getByRole("button", { name: "Choose from gallery", exact: true }).click()
      await expect(
        dialog.getByRole("button", { name: /^Use this image/ }).first(),
        "the gallery half lists what this event has already uploaded",
      ).toBeVisible()
      await expect(
        dropZone,
        "the two halves are alternatives, not a stack",
      ).toHaveCount(0)

      await dialog.getByRole("button", { name: "Upload", exact: true }).click()
      await expect(dropZone, "and back again").toBeVisible()
    }

    if (args.reject) {
      // The wrong kind of file, picked by someone in a hurry. The refusal is a
      // real answer from the presign — the size ceiling and the type allowlist
      // are conditions ON the signature — and what matters here is that it is
      // SAID and that nothing lands in the document.
      await fileInput.setInputFiles({
        name: args.reject.name as string,
        mimeType: args.reject.mimeType as string,
        buffer: Buffer.from(args.reject.body as string, "utf8"),
      })
      const alert = dialog.getByRole("alert")
      await expect(alert, "a refused upload must say so").toBeVisible()
      expect(
        ((await alert.textContent()) ?? "").trim().length,
        "the alert rendered empty, which tells the person nothing",
      ).toBeGreaterThan(0)
      await expect(
        field,
        "a refused upload must not write a broken image into the page",
      ).toHaveValue("")
    }

    if (args.cancel) {
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
      await expect(dialog, "Cancel must close the dialog").toBeHidden()
      await expect(field, "and must insert nothing").toHaveValue("")
    }
  },

  /**
   * A reorder on Manage Pages, driven from the KEYBOARD path.
   *
   * The drag is pointer-only and posts the same single `SetOrder` the arrows
   * here do — one write for the whole sequence, rather than a run of swaps that
   * can half-land. Three separate facts are asserted: the live region SAYS what
   * happened (it is the only announcement either path makes), the rows are in
   * the new order, and a RELOAD still shows it — the last one is what
   * distinguishes a reorder from a local array shuffle.
   */
  async pagesReorder(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/pages`)
    const titles = () => content(page).locator("[data-page-row] h3").allTextContents()

    expect(await titles(), "the order this reorder starts from").toEqual(args.before as string[])

    const handle = page.getByRole("button", { name: `Reorder ${args.title}`, exact: true })
    const announcement = page.locator("[data-testid=reorder-announcement]")

    if (args.button) {
      // The arrows: one swap by definition, and the only path here that works
      // with no JavaScript at all — they are plain form posts (MoveUp/MoveDown)
      // rather than the whole-sequence SetOrder the drag and the keyboard send.
      await page.getByRole("button", { name: args.button as string, exact: true }).click()
      await expect
        .poll(titles, { message: `'${args.button}' did not move the row` })
        .toEqual(args.after as string[])
      await page.reload()
      expect(
        await titles(),
        "the swap did not survive a reload — nothing was written",
      ).toEqual(args.after as string[])

      return
    }

    await handle.press("Enter")
    await expect(announcement, "picking a page up has to be announced").toContainText(
      `Picked up ${args.title}`,
    )
    const key = (args.direction as string) === "up" ? "ArrowUp" : "ArrowDown"
    for (let i = 0; i < ((args.by as number) ?? 1); i++) await handle.press(key)
    await handle.press("Enter")
    await expect(announcement, "and so does dropping it").toContainText(
      `Dropped ${args.title} at position ${args.toPosition}`,
    )

    await expect
      .poll(titles, { message: "the list did not settle into the new order" })
      .toEqual(args.after as string[])

    await page.reload()
    expect(
      await titles(),
      "the new order did not survive a reload — SetOrder never landed",
    ).toEqual(args.after as string[])
  },

  /**
   * Correcting a typo from the page list — and the reason that is a test at all.
   *
   * The claim is the PREFILL: this fixes the title and never touches the body, so
   * the body surviving is only possible if the form arrived carrying it. A `Set*`
   * that replaces the whole record makes any form that cannot prefill
   * destructive, which is how three read RPCs came to be added.
   *
   * Asserted with `toHaveValue`, not with a `[value=…]` selector: Svelte sets an
   * input's value as a PROPERTY, so the attribute is not what a form shows —
   * matching on it finds nothing on a perfectly prefilled field.
   */
  async pageEditFix(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/pages`)
    // Reached the way a person reaches it: that row's own Edit link. Scoped to
    // the ROW and matched BY ROLE, and both halves are load-bearing.
    //
    // Four rows carry a link reading "Edit", so the row is what tells them
    // apart. And the title that would have disambiguated it lives in an
    // `sr-only` span: it is part of the link's ACCESSIBLE NAME but not of its
    // rendered text, so `filter({hasText: "Edit <title>"})` matched nothing at
    // all and burned a 60s timeout while the accessibility snapshot showed the
    // link plainly there. (`clickLink` in the flow engine survives this by
    // falling back to the accessible name; this helper reimplemented only the
    // text half.)
    await pageRow(page, args.from as string)
      .getByRole("link", { name: /^Edit/ })
      .click()
    await expect(page.getByRole("heading", { name: "Edit Page" })).toBeVisible()

    const title = page.locator("input[name=title]")
    const body = page.locator("textarea#page-content")
    await expect(title, "the form must open carrying the stored title").toHaveValue(
      args.from as string,
    )
    for (const s of (args.bodyContains ?? []) as string[]) {
      expect(
        await body.inputValue(),
        `the form must open carrying the stored body — ${JSON.stringify(s)} is missing`,
      ).toContain(s)
    }

    await title.fill(args.to as string)
    await page.getByRole("button", { name: "Save changes", exact: true }).click()
    await expect(page).toHaveURL(/\/pages$/)
    await expect(
      content(page).getByRole("heading", { name: args.to as string, exact: true }),
      "the corrected title must appear in the list",
    ).toBeVisible()
    await expect(
      content(page).getByRole("heading", { name: args.from as string, exact: true }),
      "and the typo must be gone",
    ).toHaveCount(0)
  },

  /** The excerpt on a Manage Pages row: flattened, sanitized page text, on the
   *  element that carries it — and never `{@html}`-ed, which is why a `<script>`
   *  in the body comes out as words. */
  async pageExcerpt(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/pages`)
    const row = pageRow(page, args.title as string)
    await expect(row, `no Manage Pages row titled '${args.title}'`).toHaveCount(1)
    const excerpt = row.locator("[data-testid=page-excerpt]")
    for (const s of (args.contains ?? []) as string[]) {
      await expect(excerpt, "the row quotes the page's opening line").toContainText(s)
    }
    for (const s of (args.lacks ?? []) as string[]) {
      await expect(
        excerpt,
        `the excerpt must be TEXT — ${JSON.stringify(s)} would mean markup survived`,
      ).not.toContainText(s)
    }
  },

  /**
   * The markdown toolbar: each button rewrites the same markdown a person could
   * have typed, so the assertion is the FIELD's value, not a rendered preview.
   */
  async markdownToolbar(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/${args.path ?? "pages/new"}`)
    const area = page.locator(`textarea#${args.field ?? "page-content"}`)
    await area.fill(args.start as string)

    for (const step of args.presses as { select?: string; button: string; expect: string }[]) {
      if (step.select) {
        // Select the run of text the button is meant to act on, the way a person
        // would: the transformations behave differently on a selection and on a
        // bare caret, and that difference is where they go wrong.
        await area.evaluate((el, needle) => {
          const ta = el as HTMLTextAreaElement
          const at = ta.value.indexOf(needle)
          ta.setSelectionRange(at, at + needle.length)
          ta.focus()
        }, step.select)
      }
      await page.getByRole("button", { name: step.button, exact: true }).click()
      await expect(area, `after pressing '${step.button}'`).toHaveValue(step.expect)
    }
  },

  /**
   * Paste-a-table: the awkward parameters (tab vs comma vs semicolon, a quoted
   * cell holding the delimiter, a cell holding a literal pipe, ragged rows).
   *
   * Two different claims, and the panel states them separately: the SHAPE line
   * says what was recognised (columns × rows, and which separator), and the
   * field says what will be committed. "It inserted something" and "it found the
   * columns" are not the same thing — the first is true of a one-column table
   * made out of a botched split.
   */
  async markdownTable(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/${args.path ?? "pages/new"}`)
    const area = page.locator(`textarea#${args.field ?? "page-content"}`)
    await area.fill("")

    await page.getByRole("button", { name: "Paste a table", exact: true }).first().click()
    const panel = page.getByRole("group", { name: "Paste a table" })
    await expect(panel).toBeVisible()

    await panel.getByLabel("Paste rows from a spreadsheet, or CSV text").fill(args.paste as string)
    if (args.separator) await panel.getByLabel("Separator").selectOption(args.separator as string)
    if (args.firstRowIsHeader === false) {
      await panel.getByLabel("First row is a header").uncheck()
    }

    // The element that STATES the shape, not the panel around it.
    const shape = panel.locator("p[aria-live=polite]")
    await expect(shape, "the panel must say what it recognised").toHaveText(args.shape as string)

    if (args.cancel) {
      // Changed their mind. Nothing may reach the document: a converter that
      // wrote on Cancel would be a paste nobody asked for, in a field whose
      // contents someone else is about to publish.
      await panel.getByRole("button", { name: "Cancel", exact: true }).click()
      await expect(panel, "Cancel must close the panel").toHaveCount(0)
      await expect(area, "Cancel must not insert anything").toHaveValue("")

      return
    }

    await panel.getByRole("button", { name: "Insert table", exact: true }).click()
    // The markdown actually committed to the field — the textarea stays the
    // single source of truth, so this is the thing that gets saved.
    await expect(area).not.toHaveValue("")
    const value = await area.inputValue()
    for (const s of (args.contains ?? []) as string[]) {
      expect(value, `the inserted markdown must contain ${JSON.stringify(s)}`).toContain(s)
    }
    for (const s of (args.lacks ?? []) as string[]) {
      expect(value, `the inserted markdown must NOT contain ${JSON.stringify(s)}`).not.toContain(s)
    }
  },

  /**
   * The team-composition template: it downloads in both formats, it is a FILE
   * (not a page), and it carries this event's real roster.
   *
   * A template full of invented names teaches the wrong values; and the importer
   * accepting it is asserted separately, by feeding this very file back in.
   */
  async teamImportTemplate(page, args) {
    const id = requireHackathonId(args)
    const base = `/my/hackathon/${id}/teams/manage/template`

    const csv = await page.request.get(`${base}/csv`)
    expect(csv.status(), `GET ${base}/csv`).toBe(200)
    expect(csv.headers()["content-type"]).toContain("text/csv")
    expect(
      csv.headers()["content-disposition"],
      "a template that renders in the tab instead of downloading is not a template",
    ).toContain("attachment")

    const lines = (await csv.text()).split("\r\n").filter(Boolean)
    expect(lines[0], "the header the importer reads").toBe('"user_email","project","team"')
    expect(
      lines.length,
      "this event has confirmed participants, so the template cannot be header-only",
    ).toBeGreaterThan(1)
    const body = lines.slice(1).join("\n")
    for (const s of (args.mustContain ?? []) as string[]) {
      expect(body, `the template should carry ${JSON.stringify(s)}`).toContain(s)
    }

    const json = await page.request.get(`${base}/json`)
    expect(json.status()).toBe(200)
    expect(json.headers()["content-type"]).toContain("application/json")
    const rows = JSON.parse(await json.text()) as Record<string, string>[]
    expect(rows.length, "both formats describe the same roster").toBe(lines.length - 1)
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(["project", "team", "user_email"])
    }

    expect(
      (await page.request.get(`${base}/xlsx`)).status(),
      "a format the endpoint does not know must 404, never silently serve CSV",
    ).toBe(404)

    if (!args.roundTrip) return

    // The guard the two halves need: upload the SAME bytes back and require
    // that every row resolves. A template its own importer rejects is a bug
    // that surfaces only when a real organiser downloads one — two halves
    // shipped separately drift apart in a single commit.
    await page.goto(`/my/hackathon/${id}/teams/manage`)
    await page
      .locator("input[type=file]")
      .setInputFiles(uploadFile({ name: "template.csv", body: await csv.text() }))
    await content(page).getByRole("button", { name: "Preview import", exact: true }).click()

    // The preview must ARRIVE before anything is concluded from its absence,
    // and this has to retry: `locator.count()` is a snapshot, and taken the
    // instant the click resolved — before `use:enhance` finished its round trip
    // — it read 0. "There are no rows" and "the rows are not here yet" are
    // different claims, and only the second one was true.
    //
    // Not removable as "the template changes nothing, so it lists nothing": the
    // table renders EVERY planned row, `unchanged` ones included (badge "No
    // change"); `counts.changes` gates only the Apply button. A 9-row template
    // therefore renders 9 rows.
    //
    // It is also what keeps the next two assertions honest. `toHaveCount(0)` on
    // "Cannot apply" and on `[role=alert]` both pass INSTANTLY against a page
    // that never rendered a preview at all — so without a positive wait, the
    // guard against a template its own importer refuses would agree with a
    // preview that failed outright.
    await expect
      .poll(() => content(page).locator("tbody tr").count(), {
        message:
          "the preview never listed a row — either the file was refused (look for an alert) " +
          "or the plan is empty, and both make the checks below vacuous",
      })
      .toBeGreaterThan(0)

    await expect(
      content(page).getByRole("cell", { name: "Cannot apply" }),
      "a template its own importer refuses is the failure this exists for",
    ).toHaveCount(0)
    await expect(content(page).getByRole("alert")).toHaveCount(0)
    await expect(
      content(page).getByText("there is nothing to apply", { exact: false }),
      "the template IS the current roster, so applying it would be a no-op",
    ).toBeVisible()
  },

  /**
   * A bulk import, previewed — and only sometimes applied.
   *
   * The preview writes NOTHING, so every failure case here is judged on the
   * OUTCOME CELL that names the row and the reason ("no participant of this
   * hackathon has the email …"), which is what an organiser has to act on; "row
   * 1 failed" would leave them guessing. `noApply` is the all-or-nothing half:
   * one bad row must block the file's good rows too, and `badges` reads the
   * roster back off the people panel afterwards to prove it really was nothing.
   */
  async teamImportPreview(page, args) {
    const id = requireHackathonId(args)
    await page.goto(`/my/hackathon/${id}/teams/manage`)
    await expect(
      content(page).getByRole("heading", { name: "Import team composition" }),
    ).toBeVisible()

    const before: Record<string, string> = {}
    for (const name of Object.keys((args.badges ?? {}) as Record<string, string>)) {
      before[name] = ((await personTeamBadge(page, name).textContent()) ?? "").trim()
    }

    await page.locator("input[type=file]").setInputFiles(uploadFile(args.file))
    await content(page).getByRole("button", { name: "Preview import", exact: true }).click()

    for (const cell of (args.outcomes ?? []) as string[]) {
      // `.first()`: one sentence can legitimately appear on SEVERAL rows — a
      // duplicated participant is flagged on both of their rows, which is the
      // product being right and made this a strict-mode violation. Where the
      // NUMBER of rows is the claim, say so with `outcomeCounts` below rather
      // than letting `.first()` quietly accept one of two.
      await expect(
        content(page).getByRole("cell", { name: cell }).first(),
        `the preview must state: ${cell}`,
      ).toBeVisible()
    }
    for (const [cell, n] of Object.entries(
      (args.outcomeCounts ?? {}) as Record<string, number>,
    )) {
      await expect(
        content(page).getByRole("cell", { name: cell }),
        `exactly ${n} row(s) must state: ${cell}`,
      ).toHaveCount(n)
    }
    if (args.rowsAtLeast !== undefined) {
      // Retrying, for the same reason as the template round trip: a bare
      // `count()` right after an enhanced submit samples the page before its
      // round trip has re-rendered the table.
      await expect
        .poll(() => content(page).locator("tbody tr").count(), {
          message:
            "the preview listed no rows, so the outcome checks above would be vacuous",
        })
        .toBeGreaterThanOrEqual(args.rowsAtLeast as number)
    }
    for (const s of (args.alertContains ?? []) as string[]) {
      await expect(content(page).getByRole("alert"), "the refusal, in words").toContainText(s)
    }
    for (const s of (args.statusContains ?? []) as string[]) {
      await expect(content(page).getByRole("status").first()).toContainText(s)
    }
    if (args.noAlert) {
      await expect(
        content(page).getByRole("alert"),
        "a file whose every row resolves must raise nothing",
      ).toHaveCount(0)
    }
    if (args.noApply) {
      await expect(
        content(page).getByRole("button", { name: /^Apply/ }),
        "an all-or-nothing file must not offer to apply its good half",
      ).toHaveCount(0)
    }
    if (args.nothingToApply) {
      await expect(
        content(page).getByText("there is nothing to apply", { exact: false }),
        "a file that matches the current teams exactly",
      ).toBeVisible()
    }

    if (args.apply) {
      await content(page).getByRole("button", { name: args.apply as string, exact: true }).click()
      for (const s of (args.appliedContains ?? []) as string[]) {
        await expect(content(page).getByRole("status").first()).toContainText(s)
      }
      await expect(
        content(page).getByRole("alert"),
        "a bulk write that half-lands must say so — this one must not have",
      ).toHaveCount(0)
    }

    for (const [name, team] of Object.entries((args.badges ?? {}) as Record<string, string>)) {
      if (!args.apply) {
        expect(
          before[name],
          `the preview moved ${name} — it is a dry run and must write nothing`,
        ).toBe(team)
      }
      await expect(
        personTeamBadge(page, name),
        `the people panel must say ${name} is on ${team}`,
      ).toHaveText(team)
    }
  },

  /**
   * The dashboard row for an event that cannot be joined: it SAYS so, and offers
   * no button.
   *
   * Both halves matter. The row loses its control otherwise, which reads as a
   * rendering fault rather than an answer — and a bare "no Join button" would
   * also pass if the row had not rendered at all, so the sentence is the
   * positive control for the absence beside it.
   */
  async dashboardJoinClosed(page, args) {
    await page.goto("/dashboard")
    const section = dashboardSection(page, (args.section as string) ?? "Other hackathons")
    const row = dashboardRow(section, args.name as string)
    await expect(row, `no dashboard row for '${args.name}'`).toBeVisible()
    await expect(
      row.getByText("Registration closed", { exact: true }),
      "the row must say why it offers nothing",
    ).toBeVisible()
    await expect(
      row.getByRole("button", { name: "Join" }),
      "a closed event must not offer a button that can only fail",
    ).toHaveCount(0)
  },

  /**
   * The dashboard row for an event that CAN be joined — the positive control for
   * the assertion above, and the reason it is not vacuous.
   */
  async dashboardJoinOffered(page, args) {
    await page.goto("/dashboard")
    const section = dashboardSection(page, (args.section as string) ?? "Other hackathons")
    const row = dashboardRow(section, args.name as string)
    await expect(row, `no dashboard row for '${args.name}'`).toBeVisible()
    await expect(
      row.getByRole("button", { name: "Join", exact: true }),
      "an open event offers the button",
    ).toBeVisible()
    await expect(
      row.getByText("Registration closed", { exact: true }),
      "and says nothing about being closed",
    ).toHaveCount(0)
  },

  /**
   * The sign-in interstitial: what an anonymous visitor is TOLD, and where their
   * destination is parked.
   *
   * Runs with JAVASCRIPT DISABLED — not a flourish, and not only the
   * accessibility floor this page is built on. With script on it forwards itself
   * to Keycloak after ~2 s, so every assertion here would race the navigation it
   * exists to describe. That needs a context of its own, hence the browser
   * handle.
   */
  async signinInterstitial(page, args, browser) {
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      javaScriptEnabled: false,
    })
    try {
      const p = await ctx.newPage()
      await p.goto(args.open as string)
      if (args.expectParked) {
        expect(
          p.url(),
          "the guard must park the refused URL on the interstitial",
        ).toContain(`/signin?returnTo=${encodeURIComponent(args.expectParked as string)}`)
      }
      await expect(
        p.getByRole("heading", { name: "Sign in to continue" }),
        "the interstitial did not render",
      ).toBeVisible()

      // The live region, not the section around it: the explanation is the whole
      // point of this page, and one that exists only visually is not an
      // explanation for everybody.
      const region = p.locator("main [role=status]")
      await expect(region).toBeVisible()
      for (const s of (args.says ?? []) as string[]) {
        await expect(region, "the interstitial must say so").toContainText(s)
      }
      for (const s of (args.lacks ?? []) as string[]) {
        await expect(
          region,
          `the interstitial must not repeat ${JSON.stringify(s)} back`,
        ).not.toContainText(s)
      }
      await expect(
        p.getByRole("button", { name: "Go to login now" }),
        "with no script this button is the only way onward",
      ).toBeVisible()
    } finally {
      await ctx.close()
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

  if (a.expect?.okOr) {
    // Restore steps after a race: which cleanup is needed depends on which
    // racer won, so "already done" (one specific code) is as good as done.
    if (!res.ok) {
      expect(
        a.expect.okOr,
        `expected success or one of [${a.expect.okOr.join(", ")}], got ${res.code}: ${res.raw}`,
      ).toContain(res.code)
    }
  } else if (a.expect?.error) {
    expect(res.ok, `expected ${a.expect.error} but the call succeeded`).toBe(false)
    expect(res.code, res.raw).toBe(a.expect.error)
    if (a.expect.errorMatches) {
      expect(
        res.raw,
        `the call refused with the right code for an unknown reason — ` +
          `expected the message to match /${a.expect.errorMatches}/i`,
      ).toMatch(new RegExp(a.expect.errorMatches, "i"))
    }
  } else {
    expect(res.ok, `${a.method} failed: ${res.raw}`).toBe(true)
  }
  if (a.expect?.check && (res.ok || !a.expect?.okOr)) {
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

/**
 * Fire every call in `a.calls` SIMULTANEOUSLY and judge the aggregate.
 *
 * The suite is serial by design — the story depends on ordering — and stays
 * that way: the concurrency lives entirely inside this one action, which runs
 * at its place in the file like any other. Registration and tokens are warmed
 * BEFORE the start line (both are memoized), so the racing processes measure
 * the backend and not Keycloak.
 *
 * The aggregate alone proves little — "both returned OK" and "there is one
 * row" are different claims — so every race in the recipe is followed by a
 * plain rpc action that reads the end state back (exportBallotCount,
 * ownerCount, templatesOneOf, the roster).
 */
async function runRpcRace(test: AnyTest, a: RecipeAction): Promise<void> {
  const calls = a.calls ?? []
  if (calls.length < 2) {
    throw new Error(`[${a.id}] rpc.race needs at least two calls to race`)
  }
  if (!a.race) {
    throw new Error(`[${a.id}] rpc.race needs a 'race' expectation ({ok, failCodesOneOf?})`)
  }
  const methods = [...new Set(calls.map((c) => c.method))]
  const gates = a.gate ? ([] as string[]).concat(a.gate) : methods
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

  const actors = [
    ...new Set(
      calls.filter((c) => c.actor && c.actor !== "anonymous").map((c) => c.actor!),
    ),
  ]
  for (const actor of actors) {
    await ensureRegistered(credsFor(actor))
    await getTokenFor(credsFor(actor))
  }
  const resolved = await resolveDeep(calls)

  const results: RpcResult[] = await Promise.all(
    resolved.map((c) =>
      c.actor && c.actor !== "anonymous"
        ? rpcAsUserAsync(credsFor(c.actor), c.method, c.params ?? {})
        : rpcAnonymousAsync(c.method, c.params ?? {}),
    ),
  )

  const okCount = results.filter((r) => r.ok).length
  const failCodes = results
    .filter((r) => !r.ok)
    .map((r) => r.code ?? "?")
    .sort()
  const summary = results
    .map((r, i) => `#${i + 1}:${r.ok ? "OK" : (r.code ?? "?")}`)
    .join(" ")
  const failRaw = results
    .filter((r) => !r.ok)
    .map((r) => r.raw.trim())
    .join("\n---\n")

  expect(
    okCount,
    `expected exactly ${a.race.ok} of ${calls.length} concurrent calls to succeed, got ${okCount} (${summary})\n${failRaw}`,
  ).toBe(a.race.ok)

  if (a.race.failCodesOneOf) {
    const got = JSON.stringify(failCodes)
    const allowed = a.race.failCodesOneOf.map((set) => JSON.stringify([...set].sort()))
    expect(
      allowed,
      `the losers' codes were ${got}; allowed multisets: ${allowed.join(" | ")}`,
    ).toContain(got)
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
    // The browser handle as well as the page: an assertion about what a visitor
    // with NO JAVASCRIPT is told needs a context of its own, and a context
    // option cannot be changed after the fact (see signinInterstitial).
    await fn(page, await resolveDeep(a.params ?? {}), browser)
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
      if (step.expectSelector) {
        await expect(page.locator(step.expectSelector).first()).toBeVisible()
      }
      if (step.expectGoneSelector) {
        // toHaveCount(0) auto-retries: the click above may still be in its
        // enhance round-trip when this runs.
        await expect(page.locator(step.expectGoneSelector)).toHaveCount(0)
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
      case "rpc.race":
        await runRpcRace(test, a)
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
