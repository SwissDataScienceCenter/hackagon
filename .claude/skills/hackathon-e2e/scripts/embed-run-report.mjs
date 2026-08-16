#!/usr/bin/env node
// Bake a real journey run into recipe-player.html, so its `run outcome` colour
// mode answers "did it pass" on open instead of "nobody has told me".
//
//   bash scripts/run.sh journey            # writes .artifacts/results.json
//   node scripts/embed-run-report.mjs      # splices it in, reduced
//   node scripts/embed-run-report.mjs <path-to-a-playwright-json-report>
//
// Note what is NOT needed here: `--reporter=json > report.json`. The json
// reporter is already in playwright.config.ts (it writes
// .artifacts/results.json on every run), and redirecting stdout in this
// container captures the Nix/devenv/quitsh banner ahead of the JSON, so the
// file does not parse. run.sh does forward a --reporter flag if you pass one,
// but the file on disk is the thing to read.
//
// REDUCED, on purpose. The player joins on exactly three things — the action
// id, the outcome bucket and how long it took — while a full report carries
// stdout, attachments, stack frames and error snippets. Those snippets are also
// the hazard: an inline script block ends at the first LITERAL close tag even
// inside a JSON string, so every `</` is escaped here the same way
// splice-player.mjs escapes the recipe.
//
// ── The checks GATE the write; they do not follow it ────────────────────────
// The spliced document is assembled in memory, the read-back/count/close-tag
// checks all run against that string, and only a clean pass reaches the disk —
// through a temp file in the same directory and a rename, so an interrupted run
// cannot leave half a player and a refused run leaves the previous one
// byte-for-byte intact.
//
// This used to be the other way round: `writeFileSync` first, re-read and check
// after. **A validator that runs after the write certifies nothing** — the
// corrupt artefact is on disk either way, and its exit code is the only thing
// standing between a truncated player and a commit. The player is exactly the
// file where that matters: a data block that swallows its own close tag is how
// it once showed 10 actions of 274 while every suite stayed green.
//
// Same treatment as scripts/build-quality-report.mjs, deliberately the same
// shape — with ONE invariant that differs and must not be copied across: this
// file asserts the player still has THREE literal close tags (recipe data, run
// report, program), where the quality report asserts one.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const skillDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const playerPath = path.join(skillDir, "recipe-player.html")
const recipePath = path.join(skillDir, "recipe.jsonl")
const reportPath =
  process.argv[2] || path.join(skillDir, ".artifacts", "results.json")

const raw = fs.readFileSync(reportPath, "utf8")
if (/^\s*[^[{]/.test(raw)) {
  throw new Error(
    `${reportPath} does not start with JSON — it looks like captured stdout.\n` +
      `Read .artifacts/results.json (written by the json reporter in ` +
      `playwright.config.ts) instead of redirecting a run's stdout.`,
  )
}
const report = JSON.parse(raw)

// the recipe is the authority on which ids exist: a report naming something
// else is a report of another recipe, and would colour ticks that are not there
const ids = new Set(
  fs
    .readFileSync(recipePath, "utf8")
    .split("\n")
    .filter((l) => /"id"\s*:/.test(l))
    .map((l) => JSON.parse(l).id),
)

// recipe.spec.ts titles every test `[<id>] <title>`, which is the join key
const BUCKET = {
  passed: "passed",
  expected: "passed",
  failed: "failed",
  unexpected: "failed",
  timedOut: "failed",
  interrupted: "failed",
  skipped: "skipped",
  flaky: "flaky",
}
const status = {}
const totals = { passed: 0, failed: 0, skipped: 0, flaky: 0, other: 0 }
let specs = 0
let unmatched = 0
let maxEnd = 0
;(function walk(node) {
  if (!node || typeof node !== "object") return
  for (const sp of node.specs || []) {
    specs++
    const m = /^\[([^\]]+)\]/.exec(String(sp.title || ""))
    if (!m) {
      unmatched++
      continue
    }
    const test = (sp.tests || [])[0] || {}
    const results = test.results || []
    const last = results[results.length - 1] || {}
    const s = String(last.status || test.status || "unknown")
    const dur = Math.round(+last.duration || 0)
    if (!ids.has(m[1])) {
      unmatched++
      continue
    }
    status[m[1]] = [s, dur]
    const b = BUCKET[s] || "other"
    totals[b]++
    const start = Date.parse(last.startTime || "")
    if (!isNaN(start)) maxEnd = Math.max(maxEnd, start + dur)
  }
  for (const s of node.suites || []) walk(s)
})(report)

const matched = Object.keys(status).length
if (!matched)
  throw new Error(
    `no spec title in ${reportPath} starts with a recipe action id`,
  )

const startedAt = Date.parse(report.stats?.startTime || "") || 0
const payload = {
  kind: "hackagon-journey-run",
  suite: "journey",
  // the run's own clock, not this script's — a snapshot must be dated by when
  // it was PRODUCED, or its date says nothing about the code it describes
  generatedAt: new Date(startedAt || Date.now()).toISOString(),
  recipeActions: ids.size,
  specs,
  durationMs: Math.round(
    report.stats?.duration || (maxEnd && startedAt ? maxEnd - startedAt : 0),
  ),
  totals,
  status,
}

const json = JSON.stringify(payload)
const escaped = json.split("</").join("<\\/")

const html = fs.readFileSync(playerPath, "utf8")
const open = '<script id="run-report" type="application/json">'
const start = html.indexOf(open)
if (start < 0)
  throw new Error("run-report open marker not found in recipe-player.html")
const bodyStart = start + open.length
const close = "</" + "script>"
const end = html.indexOf(close, bodyStart)
if (end < 0) throw new Error("run-report close marker not found")

// The finished document — in memory. Nothing has touched the disk yet.
const next = html.slice(0, bodyStart) + "\n" + escaped + "\n" + html.slice(end)

// Read the block back OUT of that string and prove it parses in place, and that
// the document still has the three close tags it is supposed to have. Reading
// the string rather than the file loses nothing: the string IS the finished
// player, and the bytes that land are compared against it after the rename, so
// "what was checked" and "what is on disk" stay one thing.
const problems = []
const s2 = next.indexOf(open) + open.length
const e2 = next.indexOf(close, s2)
let round = null
try {
  round = JSON.parse(next.slice(s2, e2).trim().split("<\\/").join("</"))
} catch (e) {
  problems.push(
    `the embedded run-report block does not parse back: ${e.message}. ` +
      `A block that ends early is a block whose escape did not hold.`,
  )
}
const tags = next.split(close).length - 1
if (round && Object.keys(round.status).length !== matched)
  problems.push(
    `embedded ${Object.keys(round.status).length} entries, expected ${matched}`,
  )
// THREE, not one: recipe data, run report, program. The quality report's twin
// of this check asserts one close tag — same treatment, different invariant.
if (tags !== 3)
  problems.push(`expected 3 literal close tags in the player, found ${tags}`)

if (problems.length) {
  console.error(
    `\n✗ ${problems.length} problem(s) with the spliced player:\n` +
      problems.map((p) => "   " + p).join("\n"),
  )
  console.error(
    `\n✗ NOTHING WAS WRITTEN. ${path.basename(playerPath)} still holds the ` +
      `previous run report, byte for byte — fix the input (or this script) and ` +
      `run it again.`,
  )
  process.exit(1)
}

/**
 * Land the checked bytes, or land nothing at all.
 *
 * Lifted from build-quality-report.mjs deliberately, down to the retry: the
 * temp file goes in the SAME directory, because a rename across filesystems is
 * a copy and a copy is precisely the interruptible write this exists to avoid;
 * fsync precedes the rename so the rename cannot publish a name pointing at
 * contents still sitting in a buffer; and the destination is read back and
 * required to equal the string every check above ran against, or "verified" and
 * "on disk" are two different documents and only one of them was inspected.
 *
 * The rename retries on EPERM: renames on this repo's 9p bind mount
 * intermittently refuse with nothing holding the file (CLAUDE.md, container
 * trap 5) and succeed a moment later. Every failure path removes the temp, so a
 * refused run leaves the directory exactly as it found it.
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
  const landed = fs.readFileSync(dest, "utf8")
  if (landed !== text)
    throw new Error(
      `${path.basename(dest)} does not hold the bytes that were checked ` +
        `(${landed.length} chars on disk vs ${text.length} verified) — do not trust it`,
    )
}

writeChecked(playerPath, next)

const pct = (100 * escaped.length) / raw.length
console.log(
  `embedded ${matched} of ${ids.size} actions from ${path.basename(reportPath)} — ` +
    `${totals.passed} passed / ${totals.failed} failed / ${totals.skipped} skipped` +
    (totals.flaky ? ` / ${totals.flaky} flaky` : "") +
    (unmatched ? ` (${unmatched} specs not recipe actions)` : ""),
)
console.log(
  `reduced ${(raw.length / 1024).toFixed(1)} KiB → ${(escaped.length / 1024).toFixed(1)} KiB ` +
    `(${pct.toFixed(1)}% of the report) · run of ${payload.generatedAt} · ` +
    `${Math.round(payload.durationMs / 1000)}s · ${tags} literal close tags`,
)
console.log(`✓ checked first, then written: ${path.basename(playerPath)}`)
