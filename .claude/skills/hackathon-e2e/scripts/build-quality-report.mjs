#!/usr/bin/env node
/**
 * Build `quality-report.html` — a status report you could hand someone: what is
 * tested, how well, what is not, and what is known-broken.
 *
 * This is NOT recipe-player.html. The player is an animated REPLAY of the
 * recipe; this is the report about it. The report links to the player.
 *
 * ── The one rule ───────────────────────────────────────────────────────────
 * Nothing in the output is hand-typed. Every number is read from a file on
 * disk at build time, rendered with the source it came from, and then READ
 * BACK OUT of the finished HTML and re-derived by a second, independent code
 * path before the build is allowed to succeed. A stale hand-written count is
 * the failure mode this exists to make impossible — that is why `claim()`
 * stamps `data-claim`/`data-value` on every figure, and why `rederive()`
 * counts with textual scans rather than reusing the parsed objects.
 *
 * ── The check GATES the write; it does not follow it ────────────────────────
 * The document is assembled in memory, every read-back check runs against that
 * string, and only a clean pass reaches the disk — through a temp file in the
 * same directory and a rename, so an interrupted run cannot leave half a file
 * and a failing run leaves the previous report byte-for-byte intact.
 *
 * This used to be the other way round: `writeFileSync` first, `read(OUT)` and
 * re-derive after. **A validator that runs after the write certifies nothing**
 * — the bad artefact is on disk either way, its exit code is the only thing
 * standing between it and a commit, and one run whose CLAUDE.md row disagreed
 * with results.json left an `undefined`-filled report that had to be reverted
 * by hand. Reading the string rather than the file loses nothing: the string
 * IS the finished document, and the bytes that land are compared against it
 * after the rename, so "what was checked" and "what is on disk" stay one thing.
 *
 * Sources (all repo-relative, all read fresh):
 *   A  .claude/skills/hackathon-e2e/recipe.jsonl
 *   B  .claude/skills/hackathon-e2e/.artifacts/results.json
 *   C  .claude/skills/hackathon-e2e/mutations/manifest.jsonl
 *   D  .claude/skills/hackathon-e2e/mutations/.state/verify.json
 *   E  docs/testing.md
 *   F  .claude/CLAUDE.md
 *   G  api/proto/ ** /*_service.proto
 *   H  components/frontend/src
 *   I  the named spec / Go files under components/ and tests/
 *
 * ── Traps this script is built around ──────────────────────────────────────
 * 1. An inline <script> block ends at the FIRST literal close tag, even inside
 *    a JSON string — and act0.about.xss pastes one on purpose. Everything from
 *    a source goes through esc(), which turns `<` into `&lt;` and makes the
 *    sequence unrepresentable; if a JSON block is ever embedded here it must
 *    take splice-player.mjs's `</` → `<\/` escape instead. The build asserts
 *    the finished file holds exactly ONE script block either way: a second
 *    close tag appearing by accident means data truncated the document.
 * 2. Idempotent by construction: no wall-clock anywhere in the output. Dates
 *    come from the sources themselves (a run's startTime, a file's mtime, the
 *    HEAD commit date) so two runs over one tree are byte-identical.
 *
 * Usage:  node .claude/skills/hackathon-e2e/scripts/build-quality-report.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const skillDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.resolve(skillDir, "..", "..", "..")
const OUT = path.join(skillDir, "quality-report.html")

const R = (...p) => path.join(repoRoot, ...p)
const read = (p) => fs.readFileSync(p, "utf8")
const bytes = (p) => fs.statSync(p).size
const mtimeDay = (p) => fs.statSync(p).mtime.toISOString().slice(0, 10)
const rel = (p) => path.relative(repoRoot, p).split(path.sep).join("/")

/* ── source paths ─────────────────────────────────────────────────────────── */
const P = {
  recipe: R(".claude/skills/hackathon-e2e/recipe.jsonl"),
  results: R(".claude/skills/hackathon-e2e/.artifacts/results.json"),
  manifest: R(".claude/skills/hackathon-e2e/mutations/manifest.jsonl"),
  verify: R(".claude/skills/hackathon-e2e/mutations/.state/verify.json"),
  testingDoc: R("docs/testing.md"),
  claudeMd: R(".claude/CLAUDE.md"),
  protoDir: R("api/proto"),
  frontendSrc: R("components/frontend/src"),
  dragSpec: R(
    ".claude/skills/hackathon-e2e/tests/smoke/22-hackathon-pages.spec.ts",
  ),
  auditBoot: R("components/backend/internal/audit/audit_suite_test.go"),
  storageBoot: R("components/backend/internal/storage/storage_suite_test.go"),
}

/* ── claim registry ───────────────────────────────────────────────────────── */
const CLAIMS = new Map()
function claim(id, value) {
  if (CLAIMS.has(id) && CLAIMS.get(id) !== value)
    throw new Error(`claim ${id} redefined: ${CLAIMS.get(id)} vs ${value}`)
  CLAIMS.set(id, value)
  return value
}
/** A figure in the prose: registered, stamped, and re-checked after writing. */
function n(id, value, src) {
  claim(id, value)
  return `<span class="num" data-claim="${esc(id)}" data-value="${esc(String(value))}">${esc(
    String(value),
  )}</span>${src ? sup(src) : ""}`
}
const sup = (k) =>
  `<a class="src" href="#src-${k}" title="Source ${k}">${k}</a>`

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
/** Escape FIRST, then promote markdown backticks — text lifted out of a .md
 *  source arrives with them, and printing them raw makes a quote look retyped. */
const mdInline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>")

/* ══ A. the recipe ════════════════════════════════════════════════════════ */
const recipeRaw = read(P.recipe)
const recipeLines = recipeRaw.split(/\r?\n/).filter((l) => l.trim())
const recipeObjs = recipeLines.map((l, i) => {
  try {
    return JSON.parse(l)
  } catch (e) {
    throw new Error(`recipe.jsonl line ${i + 1} is not JSON: ${e.message}`)
  }
})
const actions = recipeObjs.filter((o) => o.id)
{
  const seen = new Set()
  for (const a of actions) {
    if (seen.has(a.id)) throw new Error(`duplicate recipe id: ${a.id}`)
    seen.add(a.id)
  }
}

/** Banner sections: each `comment` naming an ACT opens a section. */
const sections = []
{
  let cur = null
  for (const o of recipeObjs) {
    if (!o.id) {
      if (/ACT\s/.test(o.comment || "")) {
        const text = String(o.comment)
          .replace(/─+/g, " ")
          .trim()
          .split(/\s{2,}/)[0]
          .trim()
        const m = text.match(
          /^ACT\s+(\d+)([a-z]?|\s*\(cont\.\))\s*[—-]\s*(.*)$/,
        )
        cur = {
          act: m ? Number(m[1]) : null,
          label: m
            ? `Act ${m[1]}${/cont/.test(m[2]) ? " (cont.)" : m[2].trim()}`
            : text,
          about: m ? m[3] : text,
          ids: [],
        }
        sections.push(cur)
      }
    } else if (cur) cur.ids.push(a_id(o))
  }
  function a_id(o) {
    return o.id
  }
}
const byId = new Map(actions.map((a) => [a.id, a]))

const tally = (arr, f) => {
  const m = new Map()
  for (const x of arr) {
    const k = f(x)
    if (k === undefined || k === null) continue
    m.set(k, (m.get(k) || 0) + 1)
  }
  return m
}
const KINDS = [
  {
    key: "rpc",
    label: "rpc",
    slot: 1,
    about: "one grpcurl call, judged on its status code and payload",
  },
  {
    key: "ui.flow",
    label: "ui.flow",
    slot: 2,
    about: "a browser drives the product: click, type, submit",
  },
  {
    key: "ui.assert",
    label: "ui.assert",
    slot: 3,
    about: "a browser reads a page back and asserts what it says",
  },
  {
    key: "rpc.race",
    label: "rpc.race",
    slot: 4,
    about: "several calls fired simultaneously, judged in aggregate",
  },
  {
    key: "files.generate",
    label: "files.generate",
    slot: 5,
    about: "produces a fixture file for a later action",
  },
]
const kindCount = tally(actions, (a) => a.action)
const prioCount = tally(actions, (a) => a.priority)
const actCount = tally(actions, (a) => a.act)
const actorCount = tally(actions, (a) => a.actor)
const errCount = tally(actions, (a) => a.expect && a.expect.error)
const gateCount = actions.filter((a) => a.gate).length
const todoCount = actions.filter((a) => a.todo).length
const grpcActions = actions.filter(
  (a) => a.action === "rpc" || a.action === "rpc.race",
).length
const uiActions = actions.filter((a) =>
  String(a.action).startsWith("ui."),
).length
const fileActions = actions.filter((a) => a.action === "files.generate").length
const denialTotal = [...errCount.values()].reduce((x, y) => x + y, 0)

/** Every fully-qualified method the recipe calls directly (plain + race legs). */
const recipeMethods = new Set()
for (const a of actions) {
  if (a.method) recipeMethods.add(a.method)
  for (const c of a.calls || []) if (c.method) recipeMethods.add(c.method)
}
const recipeServices = new Set([...recipeMethods].map((m) => m.split("/")[0]))

/* ══ B. the last journey run ══════════════════════════════════════════════ */
const results = JSON.parse(read(P.results))
const specs = []
;(function walk(s) {
  for (const sp of s.specs || []) specs.push(sp)
  for (const su of s.suites || []) walk(su)
})({ suites: results.suites })
const projSpecs = new Map()
for (const s of specs)
  for (const t of s.tests)
    projSpecs.set(t.projectName, (projSpecs.get(t.projectName) || 0) + 1)
const journeySpecs = specs.filter((s) =>
  s.tests.some((t) => t.projectName === "journey"),
)
const runIds = journeySpecs
  .map((s) => (s.title.match(/^\[([^\]]+)\]/) || [])[1])
  .filter(Boolean)
const runDay = results.stats.startTime.slice(0, 10)
const runMinutes = (results.stats.duration / 60000).toFixed(1)

/** The cross-check the whole report leans on: the run executed the recipe. */
const recipeIds = actions.map((a) => a.id)
const idsIdentical = JSON.stringify(runIds) === JSON.stringify(recipeIds)
const missingFromRun = recipeIds.filter((i) => !runIds.includes(i))
const extraInRun = runIds.filter((i) => !recipeIds.includes(i))

/* ══ C+D. mutations ══════════════════════════════════════════════════════ */
const manifest = read(P.manifest)
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .filter((m) => m.id)
const mutByArena = tally(manifest, (m) => m.arena)
const gaps = manifest.filter((m) => m.gap)
const caught = manifest.filter((m) => !m.gap)
const gapsWithCrossRef = gaps.filter((m) => (m.crossRef || []).length > 0)
const gapsNoWitnessAnywhere = gaps.filter((m) =>
  /no journey witness/i.test(m.gapReason || ""),
)

const verify = JSON.parse(read(P.verify))
const verdictCount = tally(verify.rows, (r) => r.verdict)
const verifyDay = verify.at.slice(0, 10)
/** A MISMATCH whose every extra red is now DECLARED in the manifest has been
 *  superseded by a manifest edit made after the run — say so rather than
 *  reprinting a verdict the current manifest would no longer produce. */
const mismatchRows = verify.rows.filter((r) => r.verdict === "MISMATCH")
const mismatchExtras = [...new Set(mismatchRows.flatMap((r) => r.extra || []))]
const supersededMismatch = mismatchRows.filter((r) => {
  const entry = manifest.find((m) => m.id === r.id)
  return (
    entry &&
    (r.extra || []).length > 0 &&
    (r.extra || []).every((x) => (entry.expectReds || []).includes(x))
  )
})
const manifestStamp =
  fs.statSync(P.manifest).mtime.toISOString().slice(0, 19).replace("T", " ") +
  "Z"
const manifestNewerThanVerify =
  fs.statSync(P.manifest).mtimeMs > new Date(verify.at).getTime()

/** Clusters = the id prefix before the first dot. Derived, never typed. */
const clusters = new Map()
for (const m of manifest) {
  const key = m.id.split(".")[0]
  const c = clusters.get(key) || {
    key,
    total: 0,
    gaps: 0,
    files: new Set(),
    arena: new Set(),
  }
  c.total++
  if (m.gap) c.gaps++
  if (m.file) c.files.add(m.file)
  for (const e of m.edits || []) c.files.add(e.file)
  c.arena.add(m.arena)
  clusters.set(key, c)
}
const clusterList = [...clusters.values()].sort(
  (a, b) => b.gaps - a.gaps || b.total - a.total,
)
/** The surfaces worth naming: more than one mutation on them went unnoticed.
 *  Derived by a threshold, not picked — a fourth appearing tomorrow names
 *  itself, and a cluster that gets a test drops out on its own. */
const MAJOR_GAP = 2
const majorGapClusters = clusterList.filter((c) => c.gaps >= MAJOR_GAP)
const majorGapTotal = majorGapClusters.reduce((a, c) => a + c.gaps, 0)
/** The worst surface, so the "no cluster meets the threshold" case can still
 *  state a figure read off the manifest rather than restating the constant. */
const maxClusterGaps = clusterList.reduce((a, c) => Math.max(a, c.gaps), 0)

/* ══ E. docs/testing.md — the API-to-UI table ═════════════════════════════ */
const testingDoc = read(P.testingDoc)
const uncalledDoc = []
{
  const sec = testingDoc.split(/^## API-to-UI coverage$/m)[1] || ""
  for (const line of sec.split(/\r?\n/)) {
    const m = line.match(/^\|\s*`([A-Za-z]+\.[A-Za-z]+)`\s*\|\s*(.+?)\s*\|\s*$/)
    if (m) uncalledDoc.push({ rpc: m[1], why: m[2] })
  }
  if (!uncalledDoc.length)
    throw new Error(
      "could not parse the API-to-UI table out of docs/testing.md",
    )
}

/* ══ F. the suite table in .claude/CLAUDE.md ══════════════════════════════ */
const claudeMd = read(P.claudeMd)
const suiteRows = []
{
  // Whitespace-TOLERANT, deliberately. `.claude/` is treefmt-formatted now
  // (the blanket exemption was lifted), and prettier pads markdown table cells
  // out to the column width — so this header reads
  // "| Suite                | Result | When       |" on disk and an exact
  // indexOf("| Suite | Result | When |") found nothing. Every other anchor into
  // this file already collapses whitespace first (`claudeFlat`) or matches with
  // `\s*`; this was the last literal one.
  const header = claudeMd.match(/^\|\s*Suite\s*\|\s*Result\s*\|\s*When\s*\|/m)
  if (!header) throw new Error("suite table not found in .claude/CLAUDE.md")
  const start = header.index
  const lines = claudeMd.slice(start).split(/\r?\n/)
  for (const l of lines.slice(2)) {
    if (!l.startsWith("|")) break
    const cells = l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim())
    if (cells.length < 3) break
    suiteRows.push({
      suite: cells[0].replace(/`/g, ""),
      result: cells[1].replace(/\*\*/g, "").replace(/`/g, ""),
      when: cells[2].replace(/\*\*/g, ""),
    })
  }
}
const suiteRow = (needle) => {
  const r = suiteRows.find((x) => x.suite.toLowerCase().startsWith(needle))
  if (!r) throw new Error(`suite row "${needle}" not in .claude/CLAUDE.md`)
  return r
}
const firstInt = (s) => {
  const m = String(s).match(/\d+/)
  return m ? Number(m[0]) : null
}
const grab = (s, re) => {
  const m = String(s).match(re)
  return m ? Number(m[1]) : null
}
/** Prose in CLAUDE.md is hard-wrapped at 80 columns, so any phrase longer than
 *  a few words straddles a newline. Match against a whitespace-flattened copy,
 *  never the raw file — a regex written from the rendered text silently finds
 *  nothing, and an empty string reads on the page as "there was nothing to say". */
const claudeFlat = claudeMd.replace(/\s+/g, " ")
const need = (re, what) => {
  const m = claudeFlat.match(re)
  if (!m) throw new Error(`could not find ${what} in .claude/CLAUDE.md`)
  return m
}
/** Does CLAUDE.md still blame the `--ginkgo.v` flag for the backend check being
 *  red? Derived, so retiring that entry retires the report item that exists to
 *  contradict it, instead of leaving a contradiction of something nobody says. */
const claudeMdBlamesGinkgoFlag =
  /check::test -c backend` is currently RED/.test(claudeFlat)
/** CLAUDE.md's own claim about the API-to-UI ratio — kept to be contrasted. */
const claudeMdUncalled = (() => {
  const m = need(
    /API-to-UI coverage: \**(\d+) of (\d+) RPC declarations/,
    "the API-to-UI ratio",
  )
  return { called: Number(m[1]), total: Number(m[2]) }
})()
/** The waitlisted-owner paragraph, quoted rather than paraphrased. */
const waitlistedOwnerNote = need(
  /One state in that set is[\s\S]*?rather than faked\./,
  "the waitlisted-owner paragraph",
)[0]
  .replace(/\*\*/g, "")
  .replace(/`/g, "")

/* ══ G. proto declarations ═══════════════════════════════════════════════ */
function walkFiles(dir, test, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkFiles(p, test, out)
    else if (test(e.name)) out.push(p)
  }
  return out
}
const protoFiles = walkFiles(P.protoDir, (f) => f.endsWith("_service.proto"))
const declarations = []
for (const f of protoFiles) {
  const s = read(f)
  const pkg = (s.match(/^package\s+([A-Za-z0-9_.]+);/m) || [])[1]
  const re = /service\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g
  let m
  while ((m = re.exec(s))) {
    const rr = /\brpc\s+([A-Za-z0-9_]+)/g
    let x
    while ((x = rr.exec(m[2]))) declarations.push(`${pkg}.${m[1]}/${x[1]}`)
  }
}
const declSet = new Set(declarations)
const methodNames = new Set(declarations.map((d) => d.split("/")[1]))
const recipeCovered = [...recipeMethods].filter((m) => declSet.has(m))
const unknownMethods = [...recipeMethods].filter((m) => !declSet.has(m))
if (unknownMethods.length)
  throw new Error(
    `recipe calls methods with no proto declaration: ${unknownMethods.join(", ")}`,
  )

/* ══ H. the API-to-UI audit, re-run against the tree ══════════════════════ */
const frontendFiles = walkFiles(
  P.frontendSrc,
  (f) => f.endsWith(".ts") || f.endsWith(".svelte"),
).filter((f) => !rel(f).includes("src/lib/server/grpc/generated/"))
const frontendCorpus = frontendFiles.map(read).join("\n")
const lcFirst = (s) => s[0].toLowerCase() + s.slice(1)
const uncalledNow = [...methodNames]
  .filter((m) => !frontendCorpus.includes(`.${lcFirst(m)}(`))
  .sort()
/** Whether CLAUDE.md's written ratio still matches what the audit finds in the
 *  tree. Derived, because "the doc is stale" is itself a claim that goes stale
 *  the moment somebody fixes the doc — and it needs both G and H, so it cannot
 *  live beside the sentence it reads in section F. */
const claudeMdAgrees =
  claudeMdUncalled.total === declarations.length &&
  claudeMdUncalled.total - claudeMdUncalled.called === uncalledNow.length

/* ══ I. the two known-broken code sites ═══════════════════════════════════ */
const dragSpec = read(P.dragSpec)
const dragSpecLines = dragSpec.split(/\r?\n/)
const dragTestLine =
  dragSpecLines.findIndex((l) =>
    l.includes('test("dragging a row saves the whole new order'),
  ) + 1
const dragEndYLine = dragSpecLines.findIndex((l) => /const endY = /.test(l)) + 1
if (!dragTestLine || !dragEndYLine)
  throw new Error("could not locate the drag test / endY line")
const ginkgoBootstraps = [P.auditBoot, P.storageBoot].map((p) => ({
  path: rel(p),
  present: fs.existsSync(p) && /RunSpecs\(/.test(read(p)),
}))

/* ══ git identity — deterministic for a given tree ════════════════════════ */
const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}
const headSha = git("rev-parse", "--short=8", "HEAD") || "unknown"
const headDay = git("log", "-1", "--date=short", "--format=%ad") || "unknown"
const branch = git("rev-parse", "--abbrev-ref", "HEAD") || "unknown"

/** Which commit introduced the two Ginkgo bootstraps, and is it behind us?
 *  Both files land in the same commit; asking each separately and requiring
 *  the answers to agree is the cross-check for a hash nobody would re-look-up. */
const bootstrapCommits = [P.auditBoot, P.storageBoot].map((p) =>
  git("log", "-1", "--format=%h", "--", rel(p)),
)
if (new Set(bootstrapCommits).size !== 1)
  throw new Error(
    `the two ginkgo bootstraps came from different commits (${bootstrapCommits.join(", ")}) — ` +
      `the sentence in the report assumes one`,
  )
const bootstrapCommit = bootstrapCommits[0]
const bootstrapIsAncestor = (() => {
  try {
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", bootstrapCommit, "HEAD"],
      { cwd: repoRoot },
    )
    return true
  } catch {
    return false
  }
})()

/* ══ the sources table (letters referenced by every figure) ═══════════════ */
const SOURCES = [
  {
    k: "A",
    p: P.recipe,
    what: `${n("src.actionLines", actions.length)} action lines + ${n(
      "src.bannerLines",
      recipeObjs.length - actions.length,
    )} comment banners (${n("src.actSections", sections.length)} of them act headings): kinds,
      priorities, actors, gates, todos, expected status codes, and every RPC the recipe calls.`,
  },
  {
    k: "B",
    p: P.results,
    what: "Playwright's json reporter from the last journey run: stats block, per-project spec counts, and the [id] prefix on every spec title.",
  },
  {
    k: "C",
    p: P.manifest,
    what: "The mutation manifest: one deliberate breakage per line, its arena, its expected reds, and — for a gap — why nothing catches it.",
  },
  {
    k: "D",
    p: P.verify,
    what: `The verdict the mutation runner recorded for all ${n(
      "src.verifyRows",
      verify.rows.length,
    )} entries, with the reds each one actually produced.`,
  },
  {
    k: "E",
    p: P.testingDoc,
    what: "The API-to-UI coverage table: which declared RPCs have no frontend caller, and why each is deliberate.",
  },
  {
    k: "F",
    p: P.claudeMd,
    what: "The suite-results table (the only source for smoke, mobile, openreplay, backend and frontend-unit numbers) and the known-broken prose.",
  },
  {
    k: "G",
    p: P.protoDir,
    what: "Every rpc declaration in api/proto/**/*_service.proto — the denominator for both coverage counts.",
  },
  {
    k: "H",
    p: P.frontendSrc,
    what: "The frontend call sites: the API-to-UI audit is re-run here at build time rather than copied from the doc.",
  },
  {
    k: "I",
    p: P.dragSpec,
    what: "The failing smoke spec and the helper that causes it; line numbers below are read out of the file.",
  },
]

/* ══════════════════════════ HTML ════════════════════════════════════════ */
const pct = (x, total) => (total ? (x / total) * 100 : 0)

function kindBar(counts, total) {
  const segs = KINDS.filter((k) => counts.get(k.key)).map(
    (k) =>
      `<span class="seg s${k.slot}" style="width:${pct(counts.get(k.key), total).toFixed(3)}%" title="${esc(
        k.label,
      )}: ${counts.get(k.key)}"></span>`,
  )
  return `<span class="bar" role="img" aria-label="${esc(
    KINDS.filter((k) => counts.get(k.key))
      .map((k) => `${k.label} ${counts.get(k.key)}`)
      .join(", "),
  )}">${segs.join("")}</span>`
}

const actRows = sections
  .map((s) => {
    const acts = s.ids.map((id) => byId.get(id))
    const counts = tally(acts, (a) => a.action)
    const idKey = s.label.toLowerCase().replace(/[^a-z0-9]+/g, "")
    return `<tr>
      <th scope="row"><span class="actno">${esc(s.label)}</span><span class="actabout">${esc(s.about)}</span></th>
      <td class="numcell">${n(`recipe.section.${idKey}`, acts.length, "A")}</td>
      <td class="barcell">${kindBar(counts, acts.length)}</td>
      <td class="mono small">${KINDS.filter((k) => counts.get(k.key))
        .map(
          (k) =>
            `${esc(k.label)}&nbsp;${n(`recipe.section.${idKey}.${k.key}`, counts.get(k.key))}`,
        )
        .join(" · ")}</td>
    </tr>`
  })
  .join("\n")

const GLYPH = { good: "✓", warn: "!", crit: "✗", info: "•" }
/** Colour never travels alone here: a chip is glyph + word + fill, always. */
const statusChip = (state, label) =>
  `<span class="chip ${state}"><span class="glyph" aria-hidden="true">${GLYPH[state]}</span>${esc(
    label,
  )}</span>`
/**
 * A chip whose figure is stamped. `statusChip` escapes its label — which is the
 * right default and exactly why n()'s markup cannot be interpolated into it: the
 * first version of this file did, and six chips rendered their own `<span …>`
 * as visible text. The self-check did not notice (an escaped stamp no longer
 * matches the data-claim scan, so the figure simply left the checked set); the
 * BROWSER did, as 780px-wide chips overflowing the page. Hence two entry points.
 */
const chipNum = (state, id, value, suffix = "", prefix = "") =>
  `<span class="chip ${state}"><span class="glyph" aria-hidden="true">${GLYPH[state]}</span>${
    prefix ? esc(prefix) + "&nbsp;" : ""
  }${n(id, value)}${suffix ? "&nbsp;" + esc(suffix) : ""}</span>`

/** `value`, `unit`, `chip` and `note` are HTML (they carry stamped figures);
 *  only `name` is plain text. Escaping a field that holds n()'s markup renders
 *  the markup as visible text — the build asserts against that below. */
function tile({ id, name, value, unit, chip, when, src, note }) {
  return `<article class="tile">
    <h3>${esc(name)}</h3>
    <p class="val">${value}<span class="unit">${unit}</span></p>
    <p class="chips">${chip}</p>
    <p class="when">observed ${n(`${id}.when`, when, src)}</p>
    ${note ? `<p class="note">${note}</p>` : ""}
  </article>`
}

const smoke = suiteRow("smoke")
/** The drag failure's state is DERIVED from the row, never asserted in prose:
 *  it was deterministic on 2026-08-13, did not reproduce on either post-merge
 *  run, and is recorded OPEN rather than fixed. A report whose text says "one
 *  deterministic failure" beside its own "0 failed" is the stale-count failure
 *  this whole file exists to prevent — so both the chips and the item below
 *  read the numbers and say what they actually show. */
const smokeFailed = grab(smoke.result, /(\d+) failed/)
const smokeNotRun = grab(smoke.result, /(\d+) did not run/)
const smokeAtBaseline = smokeFailed === 0 && smokeNotRun === 0
const mobile = suiteRow("mobile")
const openreplay = suiteRow("openreplay")
const feUnits = suiteRow("frontend")
const backend = suiteRow("backend")
const journeyRow = suiteRow("journey")

const tiles = [
  tile({
    id: "journey",
    name: "journey — the lifecycle recipe",
    value: n("journey.expected", results.stats.expected, "B"),
    unit: "specs passed",
    chip:
      chipNum(
        "good",
        "journey.unexpected",
        results.stats.unexpected,
        "failed",
      ) +
      chipNum("good", "journey.skipped", results.stats.skipped, "skipped") +
      chipNum("good", "journey.flaky", results.stats.flaky, "flaky"),
    when: runDay,
    src: "B",
    note: `${n("journey.setupSpecs", projSpecs.get("setup"), "B")} auth-setup + ${n(
      "journey.recipeSpecs",
      projSpecs.get("journey"),
      "B",
    )} recipe actions, serial, in ${n("journey.minutes", runMinutes, "B")} min.`,
  }),
  tile({
    id: "smoke",
    name: "smoke — the seeded fixture",
    value: n("smoke.passed", firstInt(smoke.result), "F"),
    unit: "passed",
    chip:
      chipNum(
        smokeFailed ? "crit" : "good",
        "smoke.failed",
        smokeFailed,
        "failed",
      ) +
      chipNum(
        smokeNotRun ? "warn" : "good",
        "smoke.notrun",
        smokeNotRun,
        "did not run",
      ),
    when: smoke.when,
    src: "F",
    note: smokeAtBaseline
      ? `At baseline. The drag failure that was deterministic three days earlier did not
         reproduce — recorded open, not fixed: <a href="#open-drag">below</a>.`
      : `One deterministic failure and the two specs behind it in the same serial describe — <a href="#open-drag">below</a>.`,
  }),
  tile({
    id: "backend",
    name: "backend — go test ./internal/…",
    value: n(
      "backend.serviceSpecs",
      grab(backend.result, /service (\d+)\//),
      "F",
    ),
    unit: `of ${n("backend.serviceTotal", grab(backend.result, /service \d+\/(\d+)/), "F")} service specs`,
    chip:
      statusChip("good", "all packages ok") +
      chipNum(
        "info",
        "backend.capability",
        grab(backend.result, /capability (\d+)/),
        "",
        "capability",
      ) +
      chipNum(
        "info",
        "backend.middleware",
        grab(backend.result, /middleware (\d+)/),
        "",
        "middleware",
      ),
    when: backend.when,
    src: "F",
    note: "One spec is pending. Six packages; the fast tier the mutation runner drives.",
  }),
  tile({
    id: "feunits",
    name: "frontend units — vitest",
    value: n("feunits.passed", firstInt(feUnits.result), "F"),
    unit: "passed",
    chip:
      statusChip("good", "no failures reported") +
      chipNum(
        "info",
        "feunits.files",
        grab(feUnits.suite, /\((\d+) files\)/),
        "files",
      ),
    when: feUnits.when,
    src: "F",
  }),
  tile({
    id: "mobile",
    name: "mobile — phone viewport",
    value: n("mobile.passed", firstInt(mobile.result), "F"),
    unit: "passed",
    chip:
      statusChip("good", "no failures reported") +
      statusChip("warn", "older observation"),
    when: mobile.when,
    src: "F",
  }),
  tile({
    id: "openreplay",
    name: "openreplay — replay privacy",
    value: n("openreplay.passed", firstInt(openreplay.result), "F"),
    unit: "passed",
    chip:
      chipNum(
        "good",
        "openreplay.skipped",
        grab(openreplay.result, /(\d+) skipped/),
        "skipped",
      ) + statusChip("warn", "needs the replay rig"),
    when: openreplay.when,
    src: "F",
  }),
].join("\n")

const denialRows = [...errCount.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(
    ([code, c]) =>
      `<tr><td class="mono">${esc(code)}</td><td class="numcell">${n(
        `recipe.denial.${code}`,
        c,
        "A",
      )}</td><td class="barcell"><span class="bar solo"><span class="seg s1" style="width:${pct(
        c,
        denialTotal,
      ).toFixed(2)}%"></span></span></td></tr>`,
  )
  .join("\n")

const clusterRows = clusterList
  .map((c) => {
    const state = c.gaps === c.total ? "crit" : c.gaps > 0 ? "warn" : "good"
    const word =
      c.gaps === c.total
        ? c.total > 1
          ? "entire surface uncovered"
          : "uncovered"
        : c.gaps > 0
          ? "partly uncovered"
          : "covered"
    return `<tr>
      <td class="mono">${esc(c.key)}.*</td>
      <td class="numcell">${n(`mut.cluster.${c.key}.total`, c.total, "C")}</td>
      <td class="numcell">${n(`mut.cluster.${c.key}.caught`, c.total - c.gaps, "C")}</td>
      <td class="numcell">${n(`mut.cluster.${c.key}.gaps`, c.gaps, "C")}</td>
      <td>${statusChip(state, word)}</td>
      <td class="mono small">${[...c.files].map((f) => esc(f.split("/").pop())).join(", ")}</td>
    </tr>`
  })
  .join("\n")

const gapCards = gaps
  .map((g) => {
    const noWitness = /no journey witness/i.test(g.gapReason || "")
    const refs = g.crossRef || []
    return `<article class="gap">
      <h4><span class="glyph" aria-hidden="true">⚠</span> <code>${esc(g.id)}</code>
        <span class="tagrow">${statusChip(noWitness ? "crit" : "warn", noWitness ? "no witness anywhere" : "journey only")}</span></h4>
      <p class="prop">${esc(g.property)}</p>
      <p class="small mono">${esc(g.file || (g.edits || []).map((e) => e.file).join(", "))}</p>
      <p class="reason">${esc(g.gapReason)}</p>
      <p class="small">${
        refs.length
          ? `Pinned by ${n(`mut.gap.${g.id}.refs`, refs.length, "C")} journey action${
              refs.length > 1 ? "s" : ""
            }: ${refs.map((r) => `<code>${esc(r)}</code>`).join(" ")}`
          : noWitness
            ? "No journey action reaches it either — this entry is a request for a test, not a pointer to one."
            : "No <code>crossRef</code> recorded; the witness is described in prose only."
      }</p>
    </article>`
  })
  .join("\n")

const verdictRows = [
  [
    "EXACT",
    "good",
    "exactly the declared tests went red — the property is provably catchable",
  ],
  [
    "MISMATCH",
    "warn",
    "the declared set failed plus something else; every extra here is the one declared-flaky spec",
  ],
  [
    "GAP",
    "crit",
    "nothing went red — no test in the fast tier holds this property",
  ],
  [
    "GAP CLOSED",
    "warn",
    "declared a gap, but a red appeared — promote it to a real entry",
  ],
]
  .map(
    ([v, state, meaning]) => `<tr>
      <td>${statusChip(state, v)}</td>
      <td class="numcell">${n(`mut.verdict.${v.replace(/\s/g, "")}`, verdictCount.get(v) || 0, "D")}</td>
      <td>${esc(meaning)}</td>
    </tr>`,
  )
  .join("\n")

const uncalledRows = uncalledDoc
  .map((r) => {
    // The chip asserts that the re-run AGREES with the doc, not the state — a
    // row the audit can no longer reproduce is a stale doc, and that is the
    // thing worth flagging.
    const stillUncalled = uncalledNow.includes(r.rpc.split(".")[1])
    return `<tr>
      <td class="mono">${esc(r.rpc)}</td>
      <td>${mdInline(r.why)}</td>
      <td>${statusChip(stillUncalled ? "good" : "warn", stillUncalled ? "audit agrees" : "doc stale — now called")}</td>
    </tr>`
  })
  .join("\n")

const sourceRows = SOURCES.map((s) => {
  const isDir = fs.statSync(s.p).isDirectory()
  return `<tr id="src-${s.k}">
    <th scope="row" class="srckey">${s.k}</th>
    <td class="mono">${esc(rel(s.p))}${isDir ? "/" : ""}</td>
    <td class="numcell small mono">${isDir ? "—" : (bytes(s.p) / 1024).toFixed(1) + " KiB"}</td>
    <td class="small mono">${esc(mtimeDay(s.p))}</td>
    <td class="small">${s.what}</td>
  </tr>`
}).join("\n")

const smokeTotal =
  firstInt(smoke.result) +
  grab(smoke.result, /(\d+) failed/) +
  grab(smoke.result, /(\d+) did not run/)
/** `{html}` opts a cell out of escaping; a bare string is escaped. */
const cellHtml = (v) =>
  v && typeof v === "object" && "html" in v ? v.html : esc(v)
const reproRows = [
  [
    {
      html: `journey — the ${n("repro.actions", actions.length, "A")} recipe actions`,
    },
    "bash .claude/skills/devcontainer-up/scripts/e2e.sh journey",
    "writes .artifacts/results.json (source B); do not redirect stdout — the json reporter is the durable copy",
  ],
  [
    "smoke — the seeded fixture",
    "bash .claude/skills/devcontainer-up/scripts/e2e.sh smoke",
    {
      html: `${n("repro.smokeTotal", smokeTotal, "F")} specs; one is the open drag failure`,
    },
  ],
  [
    "mobile / openreplay",
    "bash .claude/skills/hackathon-e2e/scripts/run.sh mobile",
    "openreplay needs the rig up and the app wired at it, or every spec self-skips",
  ],
  [
    "backend units",
    'go test -tags "test unittest" ./internal/... -count=1',
    "from components/backend, with .devenv/profile/bin on PATH",
  ],
  ["frontend units", "just check::test -c frontend", "vitest, jsdom"],
  [
    "mutations — the whole manifest",
    "bash .claude/skills/devcontainer-up/scripts/mutate.sh run",
    "rewrites mutations/.state/verify.json (source D); NO REDS fails the run",
  ],
  [
    "mutations — anchors only",
    "bash .claude/skills/hackathon-e2e/scripts/mutate.sh check",
    "cheap enough for every commit: asserts every find: still matches its file exactly once",
  ],
  [
    "API-to-UI audit",
    "grep -rn '\\.<method>(' components/frontend/src --include='*.ts' --include='*.svelte'",
    "ignore hits under src/lib/server/grpc/generated/",
  ],
  [
    "this report",
    "node .claude/skills/hackathon-e2e/scripts/build-quality-report.mjs",
    "re-derives every figure and refuses to write one that disagrees with its source",
  ],
  [
    "the recipe player",
    "node .claude/skills/hackathon-e2e/scripts/splice-player.mjs",
    "required after any recipe edit — the player shows what is embedded, not the file",
  ],
]
  // Cells are escaped unless they were built with a stamped figure in them, and
  // that is declared per cell rather than inferred — the alternative (stop
  // escaping the whole column) trades a visible bug for an invisible one.
  .map(
    ([what, cmd, note]) =>
      `<tr><th scope="row">${cellHtml(what)}</th><td><code class="cmd">${esc(
        cmd,
      )}</code></td><td class="small">${cellHtml(note)}</td></tr>`,
  )
  .join("\n")

/* ── the document ─────────────────────────────────────────────────────────── */
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hackagon — e2e quality report</title>
<style>
/* ── Hackagon quality report ───────────────────────────────────────────────
   Same palette and the same theme mechanism as recipe-player.html, so the two
   artefacts read as one system: prefers-color-scheme decides by default and a
   data-theme stamp on <html> overrides it, in both directions. Every colour is
   a token; a theme is a palette swap, never a second set of rules.
   The five categorical slots are the validated dataviz reference palette in
   slot order — the order is the CVD-safety mechanism, so do not re-order it.
   Three light-mode slots sit under 3:1 on white, which is why every bar in
   this file is accompanied by its numbers in text (the relief rule). */
:root {
  --bg:#0d0d0d; --surface:#1a1a19; --panel:#201f1e; --line:#2c2c2a; --line-strong:#383835;
  --ink:#ffffff; --ink2:#c3c2b7; --muted:#898781;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; --s5:#d55181;
  --st-good:#0ca30c; --st-warn:#fab219; --st-crit:#d03b3b;
  --on-good:#ffffff; --on-warn:#0d0d0d; --on-crit:#ffffff; --on-info:#0d0d0d;
  --accent:#3987e5; --shadow:rgba(0,0,0,.5); --wash:rgba(255,255,255,.045);
  color-scheme: dark;
}
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) {
  --bg:#f6f6f3; --surface:#ffffff; --panel:#ebebe6; --line:#dedcd4; --line-strong:#c2c0b6;
  --ink:#14140e; --ink2:#3f3e36; --muted:#6a6961;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100; --s5:#e87ba4;
  --st-good:#067306; --st-warn:#8a5c00; --st-crit:#b52626;
  --on-good:#ffffff; --on-warn:#ffffff; --on-crit:#ffffff; --on-info:#ffffff;
  --accent:#1a5fc0; --shadow:rgba(0,0,0,.14); --wash:rgba(20,20,14,.04);
  color-scheme: light;
} }
:root[data-theme="light"] {
  --bg:#f6f6f3; --surface:#ffffff; --panel:#ebebe6; --line:#dedcd4; --line-strong:#c2c0b6;
  --ink:#14140e; --ink2:#3f3e36; --muted:#6a6961;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100; --s5:#e87ba4;
  --st-good:#067306; --st-warn:#8a5c00; --st-crit:#b52626;
  --on-good:#ffffff; --on-warn:#ffffff; --on-crit:#ffffff; --on-info:#ffffff;
  --accent:#1a5fc0; --shadow:rgba(0,0,0,.14); --wash:rgba(20,20,14,.04);
  color-scheme: light;
}

*,*::before,*::after { box-sizing:border-box; }
html { -webkit-text-size-adjust:100%; }
body {
  margin:0; background:var(--bg); color:var(--ink);
  font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;
}
h1,h2,h3,h4 { line-height:1.25; margin:0; font-weight:600; }
p { margin:0 0 .6rem; }
a { color:var(--accent); }
code,.mono { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
.small { font-size:12.5px; }

/* header */
.topbar {
  position:sticky; top:0; z-index:5; background:var(--surface);
  border-bottom:1px solid var(--line);
  display:flex; flex-wrap:wrap; gap:.75rem 1rem; align-items:center;
  padding:.7rem clamp(1rem,4vw,2.5rem);
}
.brand { font-weight:600; font-size:16px; }
.brand span { color:var(--muted); font-weight:400; }
.topmeta { color:var(--muted); font-size:12.5px; font-family:ui-monospace,monospace; }
.topbar nav { margin-left:auto; display:flex; gap:.5rem; align-items:center; }
.btn {
  font:inherit; font-size:13px; color:var(--ink2); background:var(--panel);
  border:1px solid var(--line-strong); border-radius:7px; padding:.32rem .7rem;
  cursor:pointer; text-decoration:none; display:inline-flex; gap:.4rem; align-items:center;
}
.btn:hover { color:var(--ink); border-color:var(--muted); }

main { max-width:1080px; margin:0 auto; padding:0 clamp(1rem,4vw,2.5rem) 4rem; }
section { padding-top:2.6rem; }
/* the header is sticky, so anything a #hash lands on must reserve its height —
   otherwise every source footnote scrolls its own row under the bar */
[id] { scroll-margin-top:4.2rem; }
section > h2 {
  font-size:13px; letter-spacing:.09em; text-transform:uppercase; color:var(--muted);
  border-bottom:1px solid var(--line); padding-bottom:.5rem; margin-bottom:1.1rem;
}
.lede { color:var(--ink2); max-width:70ch; }

/* hero */
.hero { display:flex; flex-wrap:wrap; gap:1.5rem 2.5rem; align-items:flex-end; padding-top:2.2rem; }
.hero .fig { font-size:clamp(52px,9vw,76px); font-weight:600; line-height:1; letter-spacing:-.02em; }
.hero .cap { color:var(--ink2); max-width:52ch; }

/* numbers + source marks. Tabular figures align columns; at display size they
   give every digit the width of a 0, so the hero and the tile values keep the
   font's proportional figures. */
.num { font-variant-numeric:tabular-nums; }
.hero .fig .num, .tile .val .num { font-variant-numeric:normal; }
a.src {
  font-size:9.5px; vertical-align:super; margin-left:.15em; text-decoration:none;
  color:var(--muted); border:1px solid var(--line-strong); border-radius:3px;
  padding:0 .18em; line-height:1;
}
a.src:hover { color:var(--ink); border-color:var(--muted); }

/* tiles */
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(255px,1fr)); gap:.9rem; }
.tile { background:var(--surface); border:1px solid var(--line); border-radius:11px; padding:.95rem 1.05rem; }
.tile h3 { font-size:12.5px; color:var(--muted); font-weight:500; }
.tile .val { font-size:34px; font-weight:600; line-height:1.1; margin:.35rem 0 .1rem; }
.tile .unit { font-size:12.5px; color:var(--muted); font-weight:400; margin-left:.45em; }
.tile .when { color:var(--muted); font-size:12px; margin:.45rem 0 0; }
.tile .note { color:var(--ink2); font-size:12.5px; margin:.5rem 0 0; }
.chips { display:flex; flex-wrap:wrap; gap:.3rem; margin:.4rem 0 0; }

/* status chips — colour never travels alone: glyph + word, always */
.chip {
  display:inline-flex; align-items:center; gap:.32em; font-size:11.5px; font-weight:500;
  border-radius:999px; padding:.1rem .5rem .13rem; white-space:nowrap;
}
.chip .glyph { font-weight:700; font-size:11px; }
.chip.good { background:var(--st-good); color:var(--on-good); }
.chip.warn { background:var(--st-warn); color:var(--on-warn); }
.chip.crit { background:var(--st-crit); color:var(--on-crit); }
.chip.info { background:var(--line-strong); color:var(--ink); }

/* tables */
table { width:100%; border-collapse:collapse; margin:.4rem 0 1rem; }
caption { text-align:left; color:var(--muted); font-size:12.5px; padding-bottom:.5rem; }
th,td { text-align:left; padding:.42rem .6rem; border-bottom:1px solid var(--line); vertical-align:top; }
thead th { color:var(--muted); font-size:11.5px; font-weight:500; letter-spacing:.05em; text-transform:uppercase; }
tbody tr:hover { background:var(--wash); }
.numcell { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.srckey { color:var(--muted); font-family:ui-monospace,monospace; width:2rem; }
.wrap { overflow-x:auto; }

/* bars — 2px surface gaps do the separating; no strokes on marks */
.bar { display:flex; height:13px; width:100%; min-width:110px; border-radius:3px; overflow:hidden; background:var(--panel); }
.bar.solo { max-width:180px; }
.seg { height:100%; box-shadow:2px 0 0 var(--surface) inset; }
.seg:first-child { box-shadow:none; }
.s1 { background:var(--s1); } .s2 { background:var(--s2); } .s3 { background:var(--s3); }
.s4 { background:var(--s4); } .s5 { background:var(--s5); }
.barcell { width:26%; min-width:130px; }
.actno { display:block; font-weight:600; }
.actabout { display:block; color:var(--ink2); font-size:12.5px; font-weight:400; }

/* legend */
.legend { display:flex; flex-wrap:wrap; gap:.35rem 1.1rem; margin:.2rem 0 1rem; font-size:12.5px; color:var(--ink2); }
.legend b { font-weight:600; color:var(--ink); }
.key { display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:.4em; vertical-align:-1px; }

/* callouts */
.callout {
  background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--st-warn);
  border-radius:0 9px 9px 0; padding:.85rem 1.05rem; margin:1rem 0;
}
.callout.crit { border-left-color:var(--st-crit); }
.callout.good { border-left-color:var(--st-good); }
.callout h3 { font-size:14px; margin-bottom:.35rem; }
.callout p:last-child { margin-bottom:0; }
.callout ul { margin:.4rem 0 .7rem; padding-left:1.1rem; }
.callout li { margin-bottom:.2rem; }

/* gap cards */
.gaps { display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:.8rem; }
.gap { background:var(--surface); border:1px solid var(--line); border-radius:11px; padding:.85rem 1rem; }
.gap h4 { font-size:13.5px; display:flex; flex-wrap:wrap; gap:.4rem; align-items:center; }
.gap h4 .glyph { color:var(--st-crit); }
.gap .prop { font-size:13px; color:var(--ink); margin:.45rem 0 .3rem; }
.gap .reason { font-size:12.5px; color:var(--ink2); }
.gap .tagrow { margin-left:auto; }

/* open items */
.item { background:var(--surface); border:1px solid var(--line); border-radius:11px; padding:.95rem 1.1rem; margin-bottom:.8rem; }
.item h3 { font-size:15px; display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; margin-bottom:.4rem; }
.item h3 .chip { margin-left:auto; }
code.cmd { display:block; font-size:12px; color:var(--ink2); word-break:break-all; }

footer { color:var(--muted); font-size:12.5px; border-top:1px solid var(--line); margin-top:3rem; padding-top:1rem; }

@media print {
  .topbar { position:static; } .btn { display:none; }
  section { break-inside:avoid-page; }
}
</style>
</head>
<body>

<header class="topbar">
  <div class="brand">Hackagon <span>· e2e quality report</span></div>
  <div class="topmeta">${esc(branch)} @ ${esc(headSha)} · ${esc(headDay)}</div>
  <nav>
    <a class="btn" href="recipe-player.html">▶ Recipe player</a>
    <button class="btn" id="btnTheme" type="button" aria-pressed="false">
      <span id="themeIcon">◐</span> <span id="themeLabel">Theme</span>
    </button>
  </nav>
</header>

<main>

<div class="hero">
  <div>
    <div class="fig">${n("recipe.actions", actions.length, "A")}</div>
    <p class="small" style="color:var(--muted);margin:.3rem 0 0">recipe actions</p>
  </div>
  <p class="cap">Every one of them ran, in order, in the last journey suite — ${n(
    "journey.recipeSpecsHero",
    projSpecs.get("journey"),
    "B",
  )} specs on ${n("journey.day", runDay, "B")}, ${n("journey.unexpectedHero", results.stats.unexpected, "B")} failed and
  ${n("journey.skippedHero", results.stats.skipped, "B")} skipped. The recipe is the product spec: it is
  what this report is mostly about, and what the numbers below qualify.</p>
</div>

<section id="headline">
  <h2>Headline</h2>
  <p class="lede">A result without a date is a claim about now that may not be true, so every tile
  carries the day it was observed. Only the journey tile is read from a machine-readable run report;
  the rest are the suite table in <code>.claude/CLAUDE.md</code>${sup("F")}, which is a written record,
  not an artefact — treat those as reported rather than measured here.</p>
  <div class="tiles">
${tiles}
  </div>

  <div class="callout ${idsIdentical ? "good" : "crit"}">
    <h3>${idsIdentical ? "The run and the recipe are the same list" : "The run and the recipe DISAGREE"}</h3>
    <p>${
      idsIdentical
        ? `The ${n("xcheck.runIds", runIds.length, "B")} spec titles in the run report carry an
           <code>[id]</code> prefix, and that sequence is identical — same members, same order — to the
           ${n("xcheck.recipeIds", recipeIds.length, "A")} action ids in <code>recipe.jsonl</code>.
           The recipe's count and the run's count are therefore the same
           ${n("xcheck.same", recipeIds.length, "A")} things, which is the claim a headline number
           normally leaves unproven — a suite can pass every test it ran while never running the ones
           that matter.`
        : `${missingFromRun.length} recipe action(s) never ran and ${extraInRun.length} spec(s) have no
           action. This build should not be trusted until that is explained.`
    }</p>
  </div>
</section>

<section id="recipe">
  <h2>What the recipe covers</h2>
  <p class="lede">"${n("recipe.actionsLede", actions.length, "A")} specs passed" says nothing about what
  they exercise. These are the nine acts, in the order they run, and the split between the two things
  an action can be: a call on the wire, or a browser using the product.</p>

  <div class="tiles" style="margin-bottom:1.4rem">
    <article class="tile"><h3>Driver</h3>
      <p class="val">${n("recipe.grpc", grpcActions, "A")}<span class="unit">over gRPC</span></p>
      <p class="chips">${chipNum("info", "recipe.browser", uiActions, "in a browser")}${chipNum(
        "info",
        "recipe.files",
        fileActions,
        "fixture",
      )}</p>
      <p class="note">A browser action is the only shape that catches a control wired to the wrong
      argument; an rpc action is the only shape that can name a status code.</p>
    </article>
    <article class="tile"><h3>Priority</h3>
      <p class="val">${n("recipe.P1", prioCount.get("P1"), "A")}<span class="unit">P1</span></p>
      <p class="chips">${chipNum("info", "recipe.P2", prioCount.get("P2"), "", "P2")}${chipNum(
        "info",
        "recipe.P3",
        prioCount.get("P3"),
        "",
        "P3",
      )}</p>
      <p class="note">Nothing is deferred: no action sets <code>implement: false</code> any more.</p>
    </article>
    <article class="tile"><h3>Expected refusals</h3>
      <p class="val">${n("recipe.denials", denialTotal, "A")}<span class="unit">declare an error</span></p>
      <p class="chips">${chipNum("info", "recipe.gates", gateCount, "gated")}${chipNum(
        "info",
        "recipe.todos",
        todoCount,
        "carry a todo",
      )}</p>
      <p class="note">A gated action skips until its RPC probes as present, then wakes up on its own.</p>
    </article>
    <article class="tile"><h3>Surface reached</h3>
      <p class="val">${n("recipe.methods", recipeCovered.length, "A")}<span class="unit">of ${n(
        "proto.declarations",
        declarations.length,
        "G",
      )} declared RPCs</span></p>
      <p class="chips">${chipNum("info", "recipe.services", recipeServices.size, "services")}${chipNum(
        "info",
        "recipe.actors",
        actorCount.size,
        "people",
      )}</p>
      <p class="note">Called <em>directly</em>. The ${n("recipe.browserAgain", uiActions, "A")} browser actions reach more of them through the UI — this counts grpcurl, so it is a floor, not total coverage.</p>
    </article>
  </div>

  <div class="legend">
    <span><b>Action kinds</b></span>
${KINDS.map(
  (k) =>
    `    <span><span class="key s${k.slot}"></span><b>${esc(k.label)}</b> ${n(
      `recipe.kind.${k.key}`,
      kindCount.get(k.key) || 0,
      "A",
    )} — ${esc(k.about)}</span>`,
).join("\n")}
  </div>

  <div class="wrap"><table>
    <caption>Each act, what it is about, and what it is made of. Bars are stacked in the legend's
    order; the counts beside them carry the same information in text.</caption>
    <thead><tr><th scope="col">Act</th><th scope="col" class="numcell">Actions</th><th scope="col">Composition</th><th scope="col">Counts</th></tr></thead>
    <tbody>
${actRows}
    </tbody>
  </table></div>

  <div class="wrap"><table>
    <caption>The ${n("recipe.denialsTable", denialTotal, "A")} actions that expect to be REFUSED, by the
    status code they demand. A refusal with the right code from the wrong reason is still a bug, which
    is why one action additionally pins the message with <code>errorMatches</code>.</caption>
    <thead><tr><th scope="col">Status code</th><th scope="col" class="numcell">Actions</th><th scope="col">Share</th></tr></thead>
    <tbody>
${denialRows}
    </tbody>
  </table></div>
</section>

<section id="mutations">
  <h2>Mutation results — can these tests go red?</h2>
  <p class="lede">A green suite proves nothing until you know it can fail. The manifest is
  ${n("mut.total", manifest.length, "C")} deliberate, reversible breakages, each paired with the exact
  set of tests that MUST notice; the runner applies one, runs the tests and asserts exactly that set
  went red. <strong>A gap means nothing in the fast tier would notice if that behaviour broke.</strong></p>

  <div class="tiles" style="margin-bottom:1.2rem">
    <article class="tile"><h3>Properties with a declared witness</h3>
      <p class="val">${n("mut.caught", caught.length, "C")}<span class="unit">of ${n(
        "mut.totalTile",
        manifest.length,
        "C",
      )}</span></p>
      <p class="chips">${statusChip("good", "provably catchable")}</p>
    </article>
    <article class="tile"><h3>Gaps — nothing goes red</h3>
      <p class="val">${n("mut.gaps", gaps.length, "C")}<span class="unit">of ${n("mut.totalTile2", manifest.length, "C")}</span></p>
      <p class="chips">${statusChip("crit", "unguarded in the fast tier")}</p>
      <p class="note">Every one is a backend property.</p>
    </article>
    <article class="tile"><h3>Arenas</h3>
      <p class="val">${n("mut.go", mutByArena.get("go"), "C")}<span class="unit">go</span></p>
      <p class="chips">${chipNum("info", "mut.vitest", mutByArena.get("vitest"), "", "vitest")}</p>
      <p class="note">The fast tier needs no running stack — it drives the compilers from source, so the
      whole manifest is a five-minute check. All ${n("mut.vitest2", mutByArena.get("vitest"), "C")} frontend entries produced reds.</p>
    </article>
    <article class="tile"><h3>Verification run</h3>
      <p class="val">${n("mut.verifyRows", verify.rows.length, "D")}<span class="unit">entries judged</span></p>
      <p class="chips">${chipNum("info", "mut.verifyDay", verifyDay, "", "recorded")}</p>
      <p class="note">Verdicts below. <code>NO REDS</code> is not a curiosity to note and move past — it
      fails the run.</p>
    </article>
  </div>

  <div class="wrap"><table>
    <caption>Verdicts as recorded in <code>mutations/.state/verify.json</code>${sup("D")} on
    ${n("mut.verifyDate", verifyDay, "D")}.</caption>
    <thead><tr><th scope="col">Verdict</th><th scope="col" class="numcell">Entries</th><th scope="col">What it means</th></tr></thead>
    <tbody>
${verdictRows}
    </tbody>
  </table></div>

  ${
    /* Source D is a RECORDING; source C is the file as it stands. When the two
       disagree about how many gaps there are, the table above is judging a
       manifest that no longer exists — say so where it is read, not only in the
       source list. Deriving the condition means the notice disappears by itself
       the moment the manifest is re-run. */
    (verdictCount.get("GAP") || 0) !== gaps.length
      ? `<div class="callout">
    <h3>The verdicts above judge an older manifest than the one below</h3>
    <p>That run recorded ${n("mut.verdict.GAP2", verdictCount.get("GAP") || 0, "D")}
    <code>GAP</code> verdicts. The manifest declares ${n("mut.gaps5", gaps.length, "C")} gap
    today${sup("C")} — Go specs written after the run closed the rest, and <strong>nothing above has
    been re-judged</strong>. Everything from here down is derived from the manifest and is current;
    the table above is a snapshot of ${n("mut.verifyDay2", verifyDay, "D")}.</p>
  </div>`
      : ""
  }

  ${
    mismatchRows.length && mismatchExtras.length === 1
      ? `<div class="callout">
    <h3>All ${n("mut.mismatch.rows", mismatchRows.length, "D")} MISMATCH verdicts have the same single
    unexpected red</h3>
    <p><code>${esc(mismatchExtras[0])}</code> — it fails roughly one run in five under in-memory
    SQLite, has nothing to do with any mutation, and is declared in the runner's
    <code>KNOWN_FLAKY</code> with that reason. Every ignored red is printed with its excuse, because a
    list of failures that don't count is exactly the shape that could hide a real one.</p>
    <p>${n("mut.mismatch.superseded", supersededMismatch.length, "D")} of the
    ${n("mut.mismatch.rows2", mismatchRows.length, "D")} would be judged differently today:
    ${supersededMismatch.map((r) => `<code>${esc(r.id)}</code>`).join(", ")} now lists that spec in its
    OWN <code>expectReds</code>, where the excuse cannot reach it — a flaky test can still be a genuine
    witness, and this one hammers concurrent joins against a cap, which is precisely what the mutation
    breaks. The recorded run counted it as an unexpected extra, so the file and the manifest disagree,
    and the timestamps do not explain it: the manifest is${manifestNewerThanVerify ? "" : " not"} newer
    than the run (${n("mut.manifestTime", manifestStamp, "C")} vs
    ${n("mut.verifyTime", verify.at.slice(0, 19).replace("T", " ") + "Z", "D")}).
    <strong>The table above is the last recorded judgement, not a live one</strong> — re-run the
    manifest to refresh it.</p>
  </div>`
      : ""
  }

  <div class="wrap"><table>
    <caption>Gaps cluster. Grouping is by the id prefix, so this is derived from the manifest rather
    than editorial: ${
      majorGapClusters.length
        ? `${n("mut.majorClusters", majorGapClusters.length, "C")} surfaces account for ${n(
            "mut.clusterGapShare",
            majorGapTotal,
            "C",
          )} of the ${n("mut.gaps2", gaps.length, "C")} gaps.`
        : `${n("mut.majorClusters", majorGapClusters.length, "C")} surfaces carry more than one gap
           now, and ${n("mut.gaps2", gaps.length, "C")} of ${n("mut.totalTile3", manifest.length, "C")}
           entries is a gap at all.`
    }</caption>
    <thead><tr><th scope="col">Cluster</th><th scope="col" class="numcell">Entries</th><th scope="col" class="numcell">Caught</th><th scope="col" class="numcell">Gaps</th><th scope="col">State</th><th scope="col">Files</th></tr></thead>
    <tbody>
${clusterRows}
    </tbody>
  </table></div>

  ${
    /* The threshold picks this callout's subject; when nothing meets the
       threshold the callout has no subject, and a heading reading "0 surfaces
       carry 0 of the 1 gaps" over an empty list is the vacuous shape this file
       is supposed to make impossible. The prose that used to live here named
       three surfaces (windows, RemoveOwner, Join) that have since been covered
       by Go specs — keeping it would have been a report asserting the opposite
       of its own table. */
    majorGapClusters.length
      ? `<div class="callout crit">
    <h3>${n("mut.majorClustersHeading", majorGapClusters.length, "C")} surfaces carry
    ${n("mut.clusterGapShareHeading", majorGapTotal, "C")} of the
    ${n("mut.gaps4", gaps.length, "C")} gaps</h3>
    <ul>${majorGapClusters
      .map(
        (c) =>
          `<li><code>${esc(c.key)}.*</code> — ${
            c.gaps === c.total
              ? `<strong>all ${n(`mut.major.${c.key}.all`, c.total, "C")}</strong> of its mutations produced zero reds`
              : `${n(`mut.major.${c.key}.gaps`, c.gaps, "C")} of ${n(
                  `mut.major.${c.key}.total`,
                  c.total,
                  "C",
                )}`
          }, in ${[...c.files].map((f) => `<code>${esc(f.split("/").pop())}</code>`).join(", ")}</li>`,
      )
      .join("")}</ul>
    <p>A cluster this size means the surface, not the entry: the manifest is saying that nothing in the
    fast tier holds ANY of the properties on it.</p>
  </div>`
      : `<div class="callout good">
    <h3>The clustering is gone — the worst surface carries
    ${n("mut.maxClusterGaps", maxClusterGaps, "C")} gap</h3>
    <p>This callout names the surfaces where more than one mutation went unnoticed, and there are
    ${n("mut.majorClustersHeading", majorGapClusters.length, "C")} of them. That is the threshold doing
    its job rather than an editorial judgement: a surface that gets a test drops out on its own, and one
    that loses its tests tomorrow names itself here without anyone editing this file. Windows,
    <code>RemoveOwner</code> and <code>Join</code>'s guards were the three; the cluster table above is
    where to check that, not this sentence.</p>
  </div>`
  }

  <div class="callout ${gaps.length ? "crit" : "good"}">
    <h3>The honesty caveat</h3>
    <p>A gap is a gap in the FAST tier, not proof the product is unguarded:
    ${n("mut.gaps.crossRef", gapsWithCrossRef.length, "C")} of the ${n("mut.gaps3", gaps.length, "C")}
    name journey actions in their <code>crossRef</code>, and ${n(
      "mut.gaps.proseOnly",
      gaps.length - gapsWithCrossRef.length - gapsNoWitnessAnywhere.length,
      "C",
    )} more describe a journey witness in prose without naming one. <strong>But those reds are DEDUCED</strong>
    — from each action's declared <code>expect.error</code>, not observed, because no journey mutation
    has been run.${
      gapsNoWitnessAnywhere.length
        ? ` And ${n(
            "mut.gaps.noWitness",
            gapsNoWitnessAnywhere.length,
            "C",
          )} entry has no witness anywhere at all: <code>${esc(
            (gapsNoWitnessAnywhere[0] || {}).id || "—",
          )}</code>. That one is a request for a test, not a pointer to one.`
        : ` ${n("mut.gaps.noWitness", gapsNoWitnessAnywhere.length, "C")} entries are witnessed
           nowhere at all — every gap in the manifest points at something that would notice.`
    }</p>
    <p>${
      gaps.length
        ? `What that adds up to: for each of those properties, the only thing standing behind it is a
           suite that costs minutes, needs the whole stack, and cannot be run on a branch.`
        : `Nothing is left in this state.`
    }</p>
  </div>

  <h3 style="margin:1.6rem 0 .7rem;font-size:14px">All ${n("mut.gapsHeading", gaps.length, "C")} gaps</h3>
  <div class="gaps">
${gapCards}
  </div>
</section>

<section id="open">
  <h2>Known-broken and open</h2>

  <div class="item" id="open-drag">
    <h3>${
      smokeAtBaseline
        ? `the drag failure stopped reproducing, and that is not an explanation ${statusChip("warn", "open")}`
        : `smoke is one short of its baseline, deterministically ${statusChip("crit", "open")}`
    }</h3>
    ${
      smokeAtBaseline
        ? `<p>The row above is at baseline: ${n("open.smokeFailedRepeat", smokeFailed, "F")} failed,
           ${n("open.smokeNotRunRepeat", smokeNotRun, "F")} did not run. This entry stays OPEN anyway.
           It was deterministic on 2026-08-13 and passed on both runs after the develop merge, which
           touched nothing in <code>dragRowTo</code> — a timing-shaped defect that stops reproducing has
           not been fixed, it has stopped being visible. The diagnosis is kept for whoever picks it
           up:</p>`
        : ""
    }
    <p><code>tests/smoke/22-hackathon-pages.spec.ts:${n(
      "open.dragLine",
      dragTestLine,
      "I",
    )}</code> — "dragging a row saves the whole new order in one write". The first drag passes; the
    RESTORE drag lands one position short. It is test-side: <code>dragRowTo</code> computes
    <code>endY</code> at line ${n("open.endYLine", dragEndYLine, "I")} from the destination row's
    bounding box <em>before the drag starts</em>, while the list reorders live on <code>dragover</code>.
    Moving down, everything below the lifted row shifts up by one row height and the pointer arrives at
    what has become the middle row — which is exactly why one direction passes and the other does not.
    When it does fail, the two specs after it are the rest of a <code>mode: "serial"</code> describe and
    never run at all. The last recorded smoke run:
    ${n(
      "open.smokeSum",
      `${firstInt(smoke.result)} + ${grab(smoke.result, /(\d+) failed/)} + ${grab(
        smoke.result,
        /(\d+) did not run/,
      )}`,
      "F",
    )} = ${n(
      "open.smokeTotal",
      firstInt(smoke.result) +
        grab(smoke.result, /(\d+) failed/) +
        grab(smoke.result, /(\d+) did not run/),
      "F",
    )}.</p>
  </div>

  <div class="item">
    <h3><code>just check::test -c backend</code> ${
      claudeMdBlamesGinkgoFlag
        ? `under <code>--ginkgo.v</code> ${statusChip("good", "stale entry — re-checked")}`
        : `is red on one flaky spec ${statusChip("warn", "open")}`
    }</h3>
    <p>The quitsh runner appends <code>--ginkgo.v</code> to every package's test binary, and
    <code>internal/audit</code> and <code>internal/storage</code> were plain <code>testing</code>
    packages that exited 1 on <code>flag provided but not defined: -ginkgo.v</code> before running
    anything. ${
      claudeMdBlamesGinkgoFlag
        ? `<code>.claude/CLAUDE.md</code>${sup("F")} records that as the reason the command is
           currently RED. <strong>The tree says otherwise.</strong>`
        : `That is no longer why it fails.`
    } Both packages carry a Ginkgo bootstrap whose only job is to register those flags:
    ${ginkgoBootstraps
      .map(
        (b) =>
          `<code>${esc(b.path)}</code> ${b.present ? "(present)" : "(MISSING)"}`,
      )
      .join(
        " and ",
      )} — both added in <code>${n("open.bootstrapCommit", bootstrapCommit, "I")}</code>,
    ${bootstrapIsAncestor ? "an ancestor of this commit" : "<strong>NOT an ancestor of this commit</strong>"}.</p>
    ${
      claudeMdBlamesGinkgoFlag
        ? `<p>The CLAUDE.md entry is stale and should be retired.</p>`
        : `<p><code>.claude/CLAUDE.md</code>${sup("F")} now records the command as red on a single
           SPEC${
             mismatchExtras.length === 1
               ? ` — <code>${esc(mismatchExtras[0])}</code>, the same one the mutation runner
                 declares flaky and excuses in ${n("mut.mismatch.rows3", mismatchRows.length, "D")}
                 of the verdicts above${sup("D")}`
               : ""
           }. That is a test-side race, and CI runs this command, so it is a red CI run whenever it
           lands — not a runner quirk to route around.</p>`
    }
  </div>

  <div class="item">
    <h3>RPCs with no frontend caller ${statusChip("warn", "by design")}</h3>
    <p>An endpoint nobody calls is an endpoint no test can reach through the product — and three of
    them once turned out to be missing features rather than spare capacity. The audit is re-run here
    against the tree, not copied from the doc: <code>api/proto/**/*_service.proto</code>${sup(
      "G",
    )} declares ${n("proto.declarationsAudit", declarations.length, "G")} RPCs under
    ${n("proto.names", methodNames.size, "G")} distinct method names (names repeat across services), and
    ${n("api.uncalledNow", uncalledNow.length, "H")} of those names appear nowhere in
    <code>components/frontend/src</code> outside the generated clients — exactly the
    ${n("api.uncalledDoc", uncalledDoc.length, "E")} that <code>docs/testing.md</code>${sup("E")} lists.</p>
    <div class="wrap"><table>
      <thead><tr><th scope="col">RPC</th><th scope="col">Why nothing calls it</th><th scope="col">Re-checked</th></tr></thead>
      <tbody>
${uncalledRows}
      </tbody>
    </table></div>
    <p class="small">Two limits worth knowing. The grep matches by method NAME, so a
    <code>Get</code> called on one service masks an uncalled <code>Get</code> on another — the count is
    a floor. And the denominator moves whenever a service gains a method, so the ratio dates faster
    than the list does: <code>.claude/CLAUDE.md</code>${sup("F")} says ${n(
      "claudemd.uncalled",
      claudeMdUncalled.total - claudeMdUncalled.called,
      "F",
    )} of ${n("claudemd.total", claudeMdUncalled.total, "F")}${
      claudeMdAgrees
        ? `, which is what this audit re-derived from
    <code>api/proto</code>${sup("G")} and <code>components/frontend/src</code>${sup("H")} just now —
    the written record and the tree agree.`
        : `, against ${n("proto.declarationsAudit2", declarations.length, "G")} declared here today.
    Prefer the table.`
    }</p>
  </div>

  <div class="item">
    <h3>Two states the recipe declines to fake ${statusChip("info", "not asserted end-to-end")}</h3>
    <p><strong>An individually ungoverned capability.</strong>
    <code>${esc("act5.pilot.cap.states")}</code>${sup("A")} says it plainly:
    ${esc((byId.get("act5.pilot.cap.states") || {}).todo || "")}</p>
    <p><strong>A waitlisted owner.</strong> ${esc(waitlistedOwnerNote)}${sup("F")} The RPC-level
    refusal is still pinned — <code>act5.owner.waitlisted</code>${sup("A")} expects
    <code>${esc(((byId.get("act5.owner.waitlisted") || {}).expect || {}).error || "")}</code> — it is
    the narrower UI gate behind it that nothing can reach.</p>
    <p class="small">Neither is faked with a fixture, and both are pinned in Go instead: a state
    manufactured by the test is not the state the product can be in, so an end-to-end assertion about
    it would be an assertion about the harness.</p>
  </div>
</section>

<section id="repro">
  <h2>How to reproduce every number</h2>
  <p class="lede">All of these run inside the devcontainer. The two that write the files this report is
  built from are marked; everything else here is read-only.</p>
  <div class="wrap"><table>
    <thead><tr><th scope="col">What</th><th scope="col">Command</th><th scope="col">Note</th></tr></thead>
    <tbody>
${reproRows}
    </tbody>
  </table></div>
</section>

<section id="sources">
  <h2>Sources</h2>
  <p class="lede">Every figure above carries a superscript letter pointing at the file it was read
  from. The build refuses to write a figure it cannot re-derive from that file by a second, independent
  code path — so a number here is traceable by construction, not by discipline.</p>
  <div class="wrap"><table>
    <thead><tr><th scope="col">Key</th><th scope="col">Path</th><th scope="col" class="numcell">Size</th><th scope="col">Modified</th><th scope="col">What was read</th></tr></thead>
    <tbody>
${sourceRows}
    </tbody>
  </table></div>
</section>

<footer>
  <p>Generated by <code>.claude/skills/hackathon-e2e/scripts/build-quality-report.mjs</code> from
  ${esc(branch)} @ ${esc(headSha)} (${esc(headDay)}). No wall-clock is embedded, so two builds over one
  tree are byte-identical. This is the status report; the animated replay of the recipe is
  <a href="recipe-player.html">recipe-player.html</a>.</p>
</footer>

</main>

<script>
/* Theme: prefers-color-scheme decides by default; the toggle writes data-theme
   on <html>, which both palette blocks are keyed to, and that wins over the OS.
   localStorage throws outright on some file:// origins, so every access is
   wrapped rather than guarded — a remembered preference is a nicety. */
var LS = {
  get: function (k) { try { return localStorage.getItem(k) } catch (e) { return null } },
  set: function (k, v) { try { localStorage.setItem(k, v) } catch (e) {} }
}
var KEY = "hqr-theme"
var lightMQ = matchMedia("(prefers-color-scheme: light)")
var $ = function (id) { return document.getElementById(id) }
function effective() {
  return document.documentElement.getAttribute("data-theme") || (lightMQ.matches ? "light" : "dark")
}
function applyTheme(t) {
  if (t) document.documentElement.setAttribute("data-theme", t)
  else document.documentElement.removeAttribute("data-theme")
  var light = effective() === "light"
  $("themeIcon").textContent = light ? "☀" : "☾"
  $("themeLabel").textContent = light ? "Light" : "Dark"
  $("btnTheme").setAttribute("aria-pressed", light ? "true" : "false")
  $("btnTheme").title = "Switch to the " + (light ? "dark" : "light") + " palette"
}
applyTheme(LS.get(KEY))
$("btnTheme").addEventListener("click", function () {
  var next = effective() === "light" ? "dark" : "light"
  applyTheme(next); LS.set(KEY, next)
})
if (lightMQ.addEventListener) lightMQ.addEventListener("change", function () {
  if (!document.documentElement.hasAttribute("data-theme")) applyTheme(null)
})
</script>
</body>
</html>
`

/* ══════════ read back, re-derive, and refuse to WRITE on a disagreement ═══ */
/* Nothing has touched the disk at this point, and nothing will until every
   check below has passed. See the header note: the write is the last thing
   this script does, not the first. */

/**
 * The second code path. Deliberately textual where the first was structural:
 * if both were `JSON.parse` + the same reduce, agreeing would prove nothing.
 */
function rederive() {
  const out = {}
  const raw = read(P.recipe)
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  const count = (re) => lines.filter((l) => re.test(l)).length

  out["recipe.actions"] = count(/"id"\s*:/)
  out["recipe.actionsLede"] = out["recipe.actions"]
  for (const k of KINDS)
    out[`recipe.kind.${k.key}`] = count(
      new RegExp(`"action"\\s*:\\s*"${k.key.replace(".", "\\.")}"`),
    )
  for (const p of ["P1", "P2", "P3"])
    out[`recipe.${p}`] = count(new RegExp(`"priority"\\s*:\\s*"${p}"`))
  out["recipe.gates"] = count(/"gate"\s*:/)
  out["recipe.todos"] = count(/"todo"\s*:/)
  out["recipe.grpc"] = out["recipe.kind.rpc"] + out["recipe.kind.rpc.race"]
  out["recipe.browser"] =
    out["recipe.kind.ui.flow"] + out["recipe.kind.ui.assert"]
  out["recipe.browserAgain"] = out["recipe.browser"]
  out["recipe.files"] = out["recipe.kind.files.generate"]
  let denials = 0
  for (const code of errCount.keys()) {
    const c = count(new RegExp(`"error"\\s*:\\s*"${code}"`))
    out[`recipe.denial.${code}`] = c
    denials += c
  }
  out["recipe.denials"] = denials
  out["recipe.denialsTable"] = denials
  out["recipe.actors"] = new Set(
    lines
      .map((l) => (l.match(/"actor"\s*:\s*"([^"]+)"/) || [])[1])
      .filter(Boolean),
  ).size
  const methods = new Set()
  for (const m of raw.matchAll(/"method"\s*:\s*"([^"]+)"/g)) methods.add(m[1])
  out["recipe.methods"] = methods.size
  out["recipe.services"] = new Set(
    [...methods].map((m) => m.split("/")[0]),
  ).size

  // per-section counts: split the raw text on ACT banners and count id lines.
  // Both JSONL files here are written with a space after the colon, so every
  // regex below allows for it — a `"key":"value"` pattern silently matches
  // nothing against `"key": "value"`, which is a zero that looks like an answer.
  const chunks = raw.split(/\n(?=\{"comment":\s*"─+ ACT )/)
  const secCounts = []
  for (const ch of chunks) {
    if (!/^\{"comment":\s*"─+ ACT /.test(ch)) continue
    secCounts.push(ch.split(/\r?\n/).filter((l) => /"id"\s*:/.test(l)).length)
  }
  const secKinds = []
  for (const ch of chunks) {
    if (!/^\{"comment":\s*"─+ ACT /.test(ch)) continue
    const m = {}
    for (const k of KINDS)
      m[k.key] = ch
        .split(/\r?\n/)
        .filter((l) =>
          new RegExp(`"action"\\s*:\\s*"${k.key.replace(".", "\\.")}"`).test(l),
        ).length
    secKinds.push(m)
  }
  sections.forEach((s, i) => {
    const key = s.label.toLowerCase().replace(/[^a-z0-9]+/g, "")
    out[`recipe.section.${key}`] = secCounts[i]
    for (const k of KINDS)
      if (secKinds[i][k.key])
        out[`recipe.section.${key}.${k.key}`] = secKinds[i][k.key]
  })

  // B — results.json, read by regex off the raw text rather than the object tree
  const rr = read(P.results)
  const stats = JSON.parse(
    rr.slice(rr.lastIndexOf('"stats":') + 8).replace(/}\s*$/, ""),
  )
  out["journey.expected"] = stats.expected
  out["journey.unexpected"] = stats.unexpected
  out["journey.unexpectedHero"] = stats.unexpected
  out["journey.skipped"] = stats.skipped
  out["journey.skippedHero"] = stats.skipped
  out["journey.flaky"] = stats.flaky
  out["journey.minutes"] = (stats.duration / 60000).toFixed(1)
  out["journey.when"] = stats.startTime.slice(0, 10)
  out["journey.day"] = out["journey.when"]
  out["journey.setupSpecs"] = (
    rr.match(/"projectName":\s*"setup"/g) || []
  ).length
  out["journey.recipeSpecs"] = (
    rr.match(/"projectName":\s*"journey"/g) || []
  ).length
  out["journey.recipeSpecsHero"] = out["journey.recipeSpecs"]
  out["xcheck.runIds"] = (rr.match(/"title":\s*"\[[^\]"]+\]/g) || []).length
  out["xcheck.recipeIds"] = out["recipe.actions"]
  out["xcheck.same"] = out["recipe.actions"]
  out["open.bootstrapCommit"] = git(
    "log",
    "-1",
    "--format=%h",
    "--",
    rel(P.storageBoot),
  )

  // C — manifest, counted line by line
  const ml = read(P.manifest)
    .split(/\r?\n/)
    .filter((l) => /"id"\s*:/.test(l))
  out["mut.total"] = ml.length
  out["mut.totalTile"] = ml.length
  out["mut.totalTile2"] = ml.length
  out["mut.gaps"] = ml.filter((l) => /"gap"\s*:\s*true/.test(l)).length
  out["mut.gaps2"] = out["mut.gaps"]
  out["mut.gaps3"] = out["mut.gaps"]
  out["mut.gapsHeading"] = out["mut.gaps"]
  out["mut.caught"] = ml.length - out["mut.gaps"]
  out["mut.go"] = ml.filter((l) => /"arena"\s*:\s*"go"/.test(l)).length
  out["mut.vitest"] = ml.filter((l) => /"arena"\s*:\s*"vitest"/.test(l)).length
  out["mut.vitest2"] = out["mut.vitest"]
  out["mut.gaps.crossRef"] = ml.filter(
    (l) => /"gap"\s*:\s*true/.test(l) && /"crossRef"\s*:\s*\[/.test(l),
  ).length
  out["mut.gaps.noWitness"] = ml.filter(
    (l) => /"gap"\s*:\s*true/.test(l) && /no journey witness/i.test(l),
  ).length
  out["mut.gaps.proseOnly"] =
    out["mut.gaps"] - out["mut.gaps.crossRef"] - out["mut.gaps.noWitness"]
  out["mut.manifestDay"] = mtimeDay(P.manifest)
  for (const l of ml) {
    const id = (l.match(/"id"\s*:\s*"([^"]+)"/) || [])[1]
    const cr = l.match(/"crossRef"\s*:\s*\[([^\]]*)\]/)
    if (id && cr)
      out[`mut.gap.${id}.refs`] = (cr[1].match(/"/g) || []).length / 2
  }
  for (const c of clusterList) {
    const rows = ml.filter((l) =>
      new RegExp(`"id"\\s*:\\s*"${c.key}\\.`).test(l),
    )
    const g = rows.filter((l) => /"gap"\s*:\s*true/.test(l)).length
    out[`mut.cluster.${c.key}.total`] = rows.length
    out[`mut.cluster.${c.key}.gaps`] = g
    out[`mut.cluster.${c.key}.caught`] = rows.length - g
  }
  const major = clusterList.filter(
    (c) => out[`mut.cluster.${c.key}.gaps`] >= MAJOR_GAP,
  )
  for (const c of major) {
    const t = out[`mut.cluster.${c.key}.total`],
      g = out[`mut.cluster.${c.key}.gaps`]
    if (t === g) out[`mut.major.${c.key}.all`] = t
    else {
      out[`mut.major.${c.key}.gaps`] = g
      out[`mut.major.${c.key}.total`] = t
    }
  }
  out["mut.majorClusters"] = major.length
  out["mut.majorClustersHeading"] = major.length
  out["mut.totalTile3"] = ml.length
  out["mut.maxClusterGaps"] = clusterList.reduce(
    (a, c) => Math.max(a, out[`mut.cluster.${c.key}.gaps`]),
    0,
  )
  out["mut.clusterGapShare"] = major.reduce(
    (a, c) => a + out[`mut.cluster.${c.key}.gaps`],
    0,
  )
  out["mut.clusterGapShareHeading"] = out["mut.clusterGapShare"]
  out["mut.gaps4"] = out["mut.gaps"]

  // D — verify.json, counted by verdict string
  const vr = read(P.verify)
  for (const [v] of [["EXACT"], ["MISMATCH"], ["GAP"], ["GAP CLOSED"]]) {
    const re = new RegExp(`"verdict"\\s*:\\s*"${v}"`, "g")
    out[`mut.verdict.${v.replace(/\s/g, "")}`] = (vr.match(re) || []).length
  }
  // "GAP" also matches inside "GAP CLOSED"? No — the quote terminates it. Verify:
  out["mut.verdict.GAP"] = (vr.match(/"verdict"\s*:\s*"GAP"/g) || []).length
  out["mut.verdict.GAP2"] = out["mut.verdict.GAP"]
  out["mut.gaps5"] = ml.filter((l) => /"gap"\s*:\s*true/.test(l)).length
  out["mut.verifyRows"] = (vr.match(/"verdict"\s*:/g) || []).length
  out["src.verifyRows"] = out["mut.verifyRows"]
  out["src.actionLines"] = out["recipe.actions"]
  out["src.bannerLines"] =
    read(P.recipe)
      .split(/\r?\n/)
      .filter((l) => l.trim()).length - out["recipe.actions"]
  out["src.actSections"] = (
    read(P.recipe).match(/^\{"comment":\s*"─+ ACT /gm) || []
  ).length
  const at = (vr.match(/"at"\s*:\s*"([^"]+)"/) || [])[1]
  out["mut.verifyDay"] = at.slice(0, 10)
  out["mut.verifyDay2"] = out["mut.verifyDay"]
  out["mut.verifyDate"] = out["mut.verifyDay"]
  out["mut.mismatch.superseded"] = supersededMismatch.length
  out["mut.mismatch.rows"] = (
    vr.match(/"verdict"\s*:\s*"MISMATCH"/g) || []
  ).length
  out["mut.mismatch.rows2"] = out["mut.mismatch.rows"]
  out["mut.mismatch.rows3"] = out["mut.mismatch.rows"]
  out["mut.manifestTime"] =
    fs.statSync(P.manifest).mtime.toISOString().slice(0, 19).replace("T", " ") +
    "Z"
  out["mut.verifyTime"] = at.slice(0, 19).replace("T", " ") + "Z"

  // E/G/H — proto + frontend, recounted with different expressions
  let decls = 0
  for (const f of protoFiles)
    decls += (read(f).match(/^[ \t]*rpc[ \t]+[A-Za-z0-9_]+/gm) || []).length
  out["proto.declarations"] = decls
  out["proto.declarationsAudit"] = decls
  out["proto.declarationsAudit2"] = decls
  out["proto.names"] = new Set(
    protoFiles.flatMap((f) =>
      [...read(f).matchAll(/^[ \t]*rpc[ \t]+([A-Za-z0-9_]+)/gm)].map(
        (m) => m[1],
      ),
    ),
  ).size
  out["api.uncalledNow"] = [...methodNames].filter(
    (m) => !new RegExp(`\\.${lcFirst(m)}\\s*\\(`).test(frontendCorpus),
  ).length
  const doc = read(P.testingDoc)
  out["api.uncalledDoc"] = (doc.split(/^## API-to-UI coverage$/m)[1] || "")
    .split(/\r?\n/)
    .filter((l) => /^\|\s*`[A-Za-z]+\.[A-Za-z]+`/.test(l)).length
  const cm = doc.match(/\*\*(\w+) RPC declarations have no frontend caller\*\*/)
  if (cm) {
    const words = { Seven: 7, Eight: 8, Nine: 9, Six: 6, Five: 5 }
    if (words[cm[1]] && words[cm[1]] !== out["api.uncalledDoc"])
      throw new Error(
        `docs/testing.md says ${cm[1]} uncalled RPCs but its table lists ${out["api.uncalledDoc"]}`,
      )
  }

  // F — the suite table, re-parsed with a stricter row regex
  const rows = [
    ...claudeMd.matchAll(
      /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|$/gm,
    ),
  ]
  const find = (k) =>
    rows.find((r) => r[1].toLowerCase().replace(/`/g, "").startsWith(k))
  const num = (s, re) => Number((String(s).match(re) || [])[1])
  const sm = find("smoke"),
    mo = find("mobile"),
    or = find("openreplay"),
    fe = find("frontend"),
    be = find("backend"),
    jo = find("journey")
  out["smoke.passed"] = num(sm[2], /(\d+) passed/)
  out["smoke.failed"] = num(sm[2], /(\d+) failed/)
  out["smoke.notrun"] = num(sm[2], /(\d+) did not run/)
  out["smoke.when"] = sm[3]
  out["open.smokeFailedRepeat"] = out["smoke.failed"]
  out["open.smokeNotRunRepeat"] = out["smoke.notrun"]
  out["open.smokeSum"] =
    `${out["smoke.passed"]} + ${out["smoke.failed"]} + ${out["smoke.notrun"]}`
  out["open.smokeTotal"] =
    out["smoke.passed"] + out["smoke.failed"] + out["smoke.notrun"]
  out["repro.smokeTotal"] = out["open.smokeTotal"]
  out["repro.actions"] = out["recipe.actions"]
  out["mobile.passed"] = num(mo[2], /(\d+) passed/)
  out["mobile.when"] = mo[3]
  out["openreplay.passed"] = num(or[2], /(\d+) passed/)
  out["openreplay.skipped"] = num(or[2], /(\d+) skipped/)
  out["openreplay.when"] = or[3]
  out["feunits.passed"] = num(fe[2], /(\d+) passed/)
  out["feunits.files"] = num(fe[1], /\((\d+) files\)/)
  out["feunits.when"] = fe[3]
  out["backend.serviceSpecs"] = num(be[2], /service (\d+)\//)
  out["backend.serviceTotal"] = num(be[2], /service \d+\/(\d+)/)
  out["backend.capability"] = num(be[2], /capability (\d+)/)
  out["backend.middleware"] = num(be[2], /middleware (\d+)/)
  out["backend.when"] = be[3]
  if (num(jo[2], /(\d+) passed/) !== out["journey.expected"])
    throw new Error(
      `.claude/CLAUDE.md claims journey ${num(jo[2], /(\d+) passed/)} but results.json recorded ${
        out["journey.expected"]
      } — one of them is stale`,
    )
  const cu = claudeMd
    .replace(/\s+/g, " ")
    .match(
      /coverage: \**(\d+) of (\d+) RPC declarations have a frontend caller/,
    )
  if (!cu) throw new Error("the API-to-UI sentence moved in .claude/CLAUDE.md")
  out["claudemd.uncalled"] = Number(cu[2]) - Number(cu[1])
  out["claudemd.total"] = Number(cu[2])

  // I — the two code sites, located by a different anchor
  const ds = read(P.dragSpec).split(/\r?\n/)
  out["open.dragLine"] =
    ds.findIndex((l) => /dragging a row saves the whole new order/.test(l)) + 1
  out["open.endYLine"] = ds.findIndex((l) => /\bendY\b\s*=/.test(l)) + 1
  return out
}

/** The finished document, checked as a string. It is not read from `OUT` —
 *  `OUT` still holds the PREVIOUS report and must keep holding it if any check
 *  below fails. `writeChecked()` compares the bytes it lands against this. */
const back = html

// One script block, exactly — a second close tag means data truncated the page.
const opens = (back.match(/<script\b/g) || []).length
const closes = (back.match(/<\/script>/g) || []).length
if (opens !== 1 || closes !== 1)
  throw new Error(
    `expected exactly one script block, found ${opens} open / ${closes} close`,
  )

// No figure may have been escaped INTO the page as text. This is the shape a
// stamped number takes after esc() has run over it, and it is invisible to the
// data-claim scan (the escaped stamp simply leaves the checked set) — it showed
// up first as raw `<span class="num" …>` printed inside a tile.
const leaked = back.match(/&lt;span class=&quot;num&quot;/g)
if (leaked)
  throw new Error(
    `${leaked.length} stamped figure(s) were HTML-escaped into visible text — a field holding ` +
      `n()'s markup was passed through esc()`,
  )

const stamped = new Map()
for (const m of back.matchAll(/data-claim="([^"]+)"\s+data-value="([^"]*)"/g))
  stamped.set(
    m[1],
    m[2]
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"'),
  )

const truth = rederive()
const problems = []
for (const [id, shown] of stamped) {
  if (!(id in truth)) {
    problems.push(
      `${id}: rendered ${shown} but the re-derivation has no value for it`,
    )
    continue
  }
  if (String(truth[id]) !== String(shown))
    problems.push(`${id}: rendered ${shown}, re-derived ${truth[id]}`)
}
/* Every registered claim must be re-derivable, stamped or not. A figure that
   only lives inside a chip is still a figure, and "the checker had nothing to
   say about it" is the shape every silent-green bug in this repo has had. */
for (const [id, v] of CLAIMS) {
  if (!(id in truth)) {
    problems.push(
      `${id}: built ${v} but rederive() covers it nowhere — add it or drop the claim`,
    )
    continue
  }
  if (!stamped.has(id) && String(truth[id]) !== String(v))
    problems.push(`${id} (unstamped): built ${v}, re-derived ${truth[id]}`)
}

if (!idsIdentical)
  problems.push(
    `the run report and recipe.jsonl are not the same list of ids (` +
      `${missingFromRun.length} never ran, ${extraInRun.length} unknown)`,
  )

/* ── print what was embedded, the way splice-player.mjs does ─────────────── */
const line = (k, v) => console.log("  " + String(k).padEnd(34) + String(v))
console.log(
  `built quality-report.html — ${(back.length / 1024).toFixed(1)} KiB, ${branch} @ ${headSha}`,
)
line(
  "recipe actions",
  `${actions.length} in ${actCount.size} acts, ${sections.length} banner sections`,
)
line(
  "  by kind",
  KINDS.map((k) => `${k.label} ${kindCount.get(k.key) || 0}`).join(", "),
)
line("  by priority", [...prioCount].map(([k, v]) => `${k} ${v}`).join(", "))
line(
  "  driver",
  `${grpcActions} gRPC, ${uiActions} browser, ${fileActions} fixture`,
)
line("  gates / todos", `${gateCount} / ${todoCount}`)
line(
  "  expected refusals",
  `${denialTotal} across ${errCount.size} status codes`,
)
line(
  "  reaches",
  `${recipeCovered.length} of ${declarations.length} declared RPCs, ${recipeServices.size} services`,
)
line(
  "journey run",
  `${results.stats.expected} passed, ${results.stats.unexpected} failed, ${results.stats.skipped} skipped (${runDay})`,
)
line(
  "  spec ids == recipe ids",
  idsIdentical ? `yes, all ${runIds.length}, same order` : "NO",
)
line(
  "mutations",
  `${manifest.length} entries — ${caught.length} with a witness, ${gaps.length} gaps`,
)
line(
  "  verdicts",
  [...verdictCount].map(([k, v]) => `${k} ${v}`).join(", ") + ` (${verifyDay})`,
)
line(
  "  gap clusters",
  majorGapClusters.map((c) => `${c.key} ${c.gaps}/${c.total}`).join(", ") ||
    "none",
)
line(
  "API-to-UI",
  `${uncalledNow.length} of ${methodNames.size} method names uncalled; ${declarations.length} declarations`,
)
line("suite table rows", suiteRows.map((r) => r.suite.split(" ")[0]).join(", "))
line("figures stamped", `${stamped.size} (${CLAIMS.size} claims registered)`)

if (problems.length) {
  console.error(`\n✗ ${problems.length} figure(s) disagree with their source:`)
  for (const p of problems) console.error("   " + p)
  console.error(
    `\n✗ NOTHING WAS WRITTEN. ${rel(OUT)} still holds the previous report, ` +
      `byte for byte — fix the source (or the figure) and run this again.`,
  )
  process.exit(1)
}

/**
 * Land the checked bytes, or land nothing at all.
 *
 * The temp file goes in the SAME directory: a rename across filesystems is a
 * copy, and a copy is precisely the interruptible write this exists to avoid.
 * fsync before the rename, so the rename cannot publish a name pointing at
 * contents still sitting in a buffer. Then read the destination back and
 * require it to equal the string every check above ran against — otherwise
 * "verified" and "on disk" are two different documents and only one of them
 * was ever inspected.
 *
 * The rename retries on EPERM: renames on this repo's 9p bind mount
 * intermittently refuse with nothing holding the file (CLAUDE.md, container
 * trap 5) and succeed a moment later. Every failure path removes the temp, so
 * a refused build leaves the directory exactly as it found it.
 */
function writeChecked(dest, text) {
  const tmp = path.join(
    path.dirname(dest),
    `.${path.basename(dest)}.tmp-${process.pid}`,
  )
  const sleep = (ms) =>
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  try {
    const fd = fs.openSync(tmp, "w")
    try {
      fs.writeFileSync(fd, text)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    for (let attempt = 1; ; attempt++) {
      try {
        fs.renameSync(tmp, dest)
        break
      } catch (e) {
        if (attempt >= 3 || e.code !== "EPERM") throw e
        sleep(250)
      }
    }
  } catch (e) {
    try {
      fs.unlinkSync(tmp)
    } catch {}
    throw e
  }
  const landed = read(dest)
  if (landed !== text)
    throw new Error(
      `${rel(dest)} does not hold the bytes that were checked ` +
        `(${landed.length} chars on disk vs ${text.length} verified) — do not trust it`,
    )
}

writeChecked(OUT, html)

console.log(
  `\n✓ ${CLAIMS.size} figures re-derived from their sources by a second code path and matched ` +
    `(${stamped.size} of them also stamped in the HTML as data-claim/data-value)`,
)
console.log(`✓ checked first, then written: ${rel(OUT)}`)
