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
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const skillDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const playerPath = path.join(skillDir, "recipe-player.html")
const recipePath = path.join(skillDir, "recipe.jsonl")
const reportPath = process.argv[2] || path.join(skillDir, ".artifacts", "results.json")

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
  passed: "passed", expected: "passed",
  failed: "failed", unexpected: "failed", timedOut: "failed", interrupted: "failed",
  skipped: "skipped", flaky: "flaky",
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
    if (!m) { unmatched++; continue }
    const test = (sp.tests || [])[0] || {}
    const results = test.results || []
    const last = results[results.length - 1] || {}
    const s = String(last.status || test.status || "unknown")
    const dur = Math.round(+last.duration || 0)
    if (!ids.has(m[1])) { unmatched++; continue }
    status[m[1]] = [s, dur]
    const b = BUCKET[s] || "other"
    totals[b]++
    const start = Date.parse(last.startTime || "")
    if (!isNaN(start)) maxEnd = Math.max(maxEnd, start + dur)
  }
  for (const s of node.suites || []) walk(s)
})(report)

const matched = Object.keys(status).length
if (!matched) throw new Error(`no spec title in ${reportPath} starts with a recipe action id`)

const startedAt = Date.parse(report.stats?.startTime || "") || 0
const payload = {
  kind: "hackagon-journey-run",
  suite: "journey",
  // the run's own clock, not this script's — a snapshot must be dated by when
  // it was PRODUCED, or its date says nothing about the code it describes
  generatedAt: new Date(startedAt || Date.now()).toISOString(),
  recipeActions: ids.size,
  specs,
  durationMs: Math.round(report.stats?.duration || (maxEnd && startedAt ? maxEnd - startedAt : 0)),
  totals,
  status,
}

const json = JSON.stringify(payload)
const escaped = json.split("</").join("<\\/")

const html = fs.readFileSync(playerPath, "utf8")
const open = '<script id="run-report" type="application/json">'
const start = html.indexOf(open)
if (start < 0) throw new Error("run-report open marker not found in recipe-player.html")
const bodyStart = start + open.length
const close = "</" + "script>"
const end = html.indexOf(close, bodyStart)
if (end < 0) throw new Error("run-report close marker not found")
fs.writeFileSync(playerPath, html.slice(0, bodyStart) + "\n" + escaped + "\n" + html.slice(end))

// read it back and prove it parses in place, and that the file still has the
// three close tags it is supposed to have — a splice nobody verified is how the
// player once showed 10 actions of 274
const back = fs.readFileSync(playerPath, "utf8")
const s2 = back.indexOf(open) + open.length
const e2 = back.indexOf(close, s2)
const round = JSON.parse(back.slice(s2, e2).trim().split("<\\/").join("</"))
const tags = back.split(close).length - 1
if (Object.keys(round.status).length !== matched)
  throw new Error(`embedded ${Object.keys(round.status).length} entries, expected ${matched}`)
if (tags !== 3) throw new Error(`expected 3 literal close tags in the player, found ${tags}`)

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
    `${Math.round(payload.durationMs / 1000)}s · 3 literal close tags`,
)
