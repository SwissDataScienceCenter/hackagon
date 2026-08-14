#!/usr/bin/env node
/**
 * Mutation testing for the Hackagon test suites.
 *
 * The premise, in one sentence: a green test proves nothing until you have
 * seen it go red. `.claude/CLAUDE.md`'s "Ways a test reported green while
 * proving nothing" is nine entries long and every one of them was found BY
 * HAND, once. This turns that hunt into something that runs.
 *
 * Each manifest entry is a precise, reversible source change plus the exact
 * set of tests that MUST go red because of it. Three verdicts, and only one is
 * a pass:
 *
 *   NO REDS      the property is not tested by anything. THE HEADLINE RESULT —
 *                this is what the whole exercise is for, and it is a failure
 *                of the run, never a curiosity to note and move past.
 *   EXTRA REDS   something else broke too: an over-broad mutation, or coupling
 *                nobody knew about. Also a failure; the extras are named.
 *   EXACT        the named tests went red and nothing else did. Pass.
 *
 * Restoration is verified, never assumed — see restore()/assertCleanTree().
 * Refuses to start on a dirty tree, journals every edit to disk before making
 * it, and restores from that journal on exit, on signal, and on demand
 * (`restore`), because a trap cannot survive a SIGKILL or a container
 * recreate and a mutation left in the tree could be committed by someone else.
 */

import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.dirname(HERE)
const ROOT = path.resolve(SKILL_DIR, "../../..")
const STATE = path.join(HERE, ".state")
const JOURNAL = path.join(STATE, "journal.json")
const BACKUPS = path.join(STATE, "backup")
const MANIFEST = path.join(HERE, "manifest.jsonl")

// The Nix dev shell is a repo-wide mutex here — ~5s to enter unopposed
// (re-measured 2026-08-14) and serializing under contention (container trap 4).
// Every binary this runner needs is already in devenv's profile, which is a
// plain directory of symlinks and costs nothing to put on PATH. Never call
// `just nix::develop` from this file: one shell entry per mutation is pure
// overhead against a tier whose whole point is costing seconds.
const DEVENV_BIN = path.join(ROOT, ".devenv/profile/bin")
const ENV = {
  ...process.env,
  PATH: fs.existsSync(DEVENV_BIN) ? `${DEVENV_BIN}${path.delimiter}${process.env.PATH}` : process.env.PATH,
}

const C = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

// ─── The tree must be clean, and must be clean again afterwards ─────────────

function gitStatus() {
  return execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8", env: ENV })
}

/**
 * The paths a cleanliness check is allowed to have an opinion about: every file
 * some mutation in the manifest names, and `components/` as a whole.
 *
 * SCOPED, and the scope is load-bearing twice over.
 *
 * A repo-wide "git status is empty" check is the strongest statement available
 * and it is unusable here, for two independent reasons that both bite on a
 * normal day. This container reports three git-lfs pointer files as permanently
 * modified with zero edits in play (container trap 4), so the literal check can
 * never pass and would simply be switched off by whoever hit it first. And a
 * repo-wide check is a check on OTHER PEOPLE: the first run of this tool aborted
 * ten mutations because a second agent added a file elsewhere in `.claude/`
 * while it worked — nothing to do with any mutation, and exactly the kind of
 * false alarm that gets a safety check deleted.
 *
 * So the guarantee is narrowed to something true and worth keeping: no file this
 * runner may write is dirty afterwards. Everything else in the tree is somebody
 * else's business.
 */
let mutablePrefixes = ["components/"]
let dirtyBaseline = null

function setMutableScope(muts) {
  const dirs = new Set(mutablePrefixes)
  for (const m of muts) for (const e of m.edits) dirs.add(e.file)
  mutablePrefixes = [...dirs]
}

function inScope(p) {
  return mutablePrefixes.some((prefix) => p === prefix || p.startsWith(prefix))
}

function dirtyPaths() {
  return gitStatus()
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
    .filter(inScope)
    .sort()
}

function captureDirtyBaseline() {
  dirtyBaseline = new Set(dirtyPaths())
}

function assertCleanTree(context) {
  const unexpected = dirtyPaths().filter((p) => !dirtyBaseline?.has(p))
  if (unexpected.length > 0) {
    throw new Error(
      `${context}: files this runner may write are dirty and should not be:\n` +
        unexpected.map((p) => `  ${p}`).join("\n") +
        `\nA mutation may still be applied. Run:  node ${path.relative(ROOT, HERE)}/run.mjs restore`,
    )
  }
}

function refuseIfDirty() {
  const dirty = dirtyPaths()
  if (dirty.length > 0) {
    console.error(
      C.red("refusing to start: files this tool mutates already have uncommitted changes.\n") +
        dirty.map((p) => `  ${p}`).join("\n") +
        "\n\nMutation testing edits these files and restores them from a journal. It " +
        "cannot tell your work from its own, and a mutation that survives into a " +
        "commit is the worst outcome this tool can produce. Commit or stash first.",
    )
    process.exit(2)
  }
}

// ─── Journal: apply / restore, durable across a hard kill ───────────────────

function readJournal() {
  if (!fs.existsSync(JOURNAL)) return []
  try {
    return JSON.parse(fs.readFileSync(JOURNAL, "utf8"))
  } catch {
    return []
  }
}

function writeJournal(entries) {
  fs.mkdirSync(STATE, { recursive: true })
  fs.writeFileSync(JOURNAL, JSON.stringify(entries, null, 2))
}

/**
 * Apply one mutation, having first written the original bytes to disk.
 *
 * The backup is written and fsync'd BEFORE the edit, so the only window in
 * which an interrupted run can lose the original is one that ends with the
 * original still in place.
 */
function apply(mut) {
  mut.edits.forEach((edit, i) => {
    const abs = path.join(ROOT, edit.file)
    if (!fs.existsSync(abs)) throw new Error(`${mut.id}: no such file: ${edit.file}`)
    const original = fs.readFileSync(abs, "utf8")

    const occurrences = original.split(edit.find).length - 1
    const want = edit.occurrences ?? 1
    if (occurrences !== want) {
      // A manifest that silently stops mutating is the same disease as a test
      // that silently stops asserting, so this is loud and fatal.
      throw new Error(
        `${mut.id}: anchor #${i + 1} matches ${occurrences} time(s) in ${edit.file}, expected ${want}.\n` +
          `The code moved out from under this mutation — re-anchor it, do not relax the count.\n` +
          `  anchor: ${JSON.stringify(edit.find)}`,
      )
    }

    fs.mkdirSync(BACKUPS, { recursive: true })
    const backup = path.join(BACKUPS, `${mut.id.replace(/[^\w.-]/g, "_")}.${i}.bak`)
    const fd = fs.openSync(backup, "w")
    fs.writeSync(fd, original)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    writeJournal([...readJournal(), { id: mut.id, file: edit.file, backup }])

    fs.writeFileSync(abs, original.split(edit.find).join(edit.replace))
  })
}

/**
 * Undo everything the journal records, NEWEST FIRST.
 *
 * The order is load-bearing and was a real bug, caught by this tool's own
 * post-restore check on its first multi-edit mutation. Two edits to ONE file
 * journal two backups: the first holds the pristine text, the SECOND holds the
 * text as it stood after edit 1 — i.e. already mutated. Replaying forwards
 * restores the original and then overwrites it with the half-mutated copy, so
 * the file is left broken while every backup on disk is intact and the journal
 * reads as fully unwound. Reversing makes each entry undo exactly the edit that
 * produced it, and the last one written is the first one undone.
 */
function restore({ quiet = false } = {}) {
  const entries = readJournal()
  for (const e of [...entries].reverse()) {
    if (!fs.existsSync(e.backup)) {
      console.error(C.red(`restore: backup for ${e.id} is missing (${e.backup}) — restoring from git`))
      spawnSync("git", ["checkout", "--", e.file], { cwd: ROOT, env: ENV })
      continue
    }
    fs.copyFileSync(e.backup, path.join(ROOT, e.file))
    if (!quiet) console.log(C.dim(`  restored ${e.file} (${e.id})`))
  }
  writeJournal([])
  return entries.length
}

// The trap. `exit` covers normal and thrown paths; the signals cover Ctrl-C and
// a `docker stop`. None of them covers SIGKILL — that is what the standalone
// `restore` subcommand and the journal on disk are for.
let cleanupInstalled = false
function installCleanup() {
  if (cleanupInstalled) return
  cleanupInstalled = true
  const bail = (why) => {
    if (readJournal().length > 0) {
      console.error(C.yellow(`\n${why} — restoring mutated files`))
      restore()
    }
  }
  process.on("exit", () => bail("run ended"))
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      bail(sig)
      process.exit(130)
    })
  }
  process.on("uncaughtException", (e) => {
    console.error(C.red(String(e?.stack ?? e)))
    bail("uncaught exception")
    process.exit(1)
  })
}

// ─── Arenas ─────────────────────────────────────────────────────────────────
//
// An arena is "where the evidence is": how to run a body of tests and how to
// name each one. Cost is why there is more than one — see SKILL.md. Every
// arena returns a Set of stable test identities that FAILED.

const BACKEND = path.join(ROOT, "components/backend")
const FRONTEND = path.join(ROOT, "components/frontend")

// One scratch directory for the whole run, not one per report. These land in
// the container's /tmp (tmpfs), never under the 9p-mounted workspace.
let scratch = null
let scratchSeq = 0
function tmpfile(name) {
  scratch ??= fs.mkdtempSync(path.join(os.tmpdir(), "hackagon-mut-"))
  return path.join(scratch, `${scratchSeq++}-${name}`)
}

/**
 * Ginkgo bootstrap functions, so their wrapper `TestXxx` red is not double
 * counted alongside the spec reds it is merely the sum of. Derived from the
 * source rather than listed, so a new suite needs no edit here.
 *
 * MEMOIZED, and that is not a micro-optimisation: it scans every `*_test.go`
 * under `internal/` — ~20 files, several of them 1500-2500 lines — and in the
 * devcontainer those live on the 9p bind mount. Recomputing it on every arena
 * invocation was costing more per mutation than the Go test run it supports.
 * No mutation in the manifest touches a `_test.go`, so the answer cannot change
 * during a run.
 */
let ginkgoWrapperCache = null
function ginkgoWrappers() {
  if (ginkgoWrapperCache) return ginkgoWrapperCache
  const out = new Set()
  const dirs = fs.readdirSync(path.join(BACKEND, "internal"), { withFileTypes: true })
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const dir = path.join(BACKEND, "internal", d.name)
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith("_test.go")) continue
      const src = fs.readFileSync(path.join(dir, f), "utf8")
      if (!src.includes("RunSpecs")) continue
      for (const m of src.matchAll(/func\s+(Test\w+)\s*\(\s*\w+\s+\*testing\.T\s*\)/g)) out.add(m[1])
    }
  }
  ginkgoWrapperCache = out
  return out
}

const GO_PACKAGES = [
  "./internal/service/",
  "./internal/middleware/",
  "./internal/capability/",
  "./internal/storage/",
  "./internal/audit/",
  "./internal/config/",
]

/**
 * The Go backend suites. ~6s for all six packages, cold, with no stack running
 * and no Nix shell entered — which is why most of the manifest lives here.
 *
 * Collects BOTH shapes of Go test this repo has: Ginkgo specs (identified by
 * their full `Describe > Context > It` text, read from --ginkgo.json-report)
 * and plain `TestXxx` functions (read from `go test -json`). A package that has
 * both contributes both.
 */
function runGo(cfg) {
  const packages = cfg.packages ?? GO_PACKAGES
  const reds = new Set()
  const wrappers = ginkgoWrappers()
  let buildFailure = null

  for (const pkg of packages) {
    const report = tmpfile("ginkgo.json")
    const r = spawnSync(
      "go",
      [
        "test", "-count=1", "-tags", "test unittest", "-json", pkg,
        `--ginkgo.json-report=${report}`,
      ],
      { cwd: BACKEND, env: ENV, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    )
    const short = pkg.replace(/^\.\/internal\//, "").replace(/\/$/, "")

    // A mutation that does not compile is not a test result. Reporting it as
    // "every test went red" would let a mutation that cannot possibly be
    // evaluated masquerade as a well-caught one.
    const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`
    if (/\[build failed\]|cannot find package|# \S+\n.*\.go:\d+/.test(combined) && !fs.existsSync(report)) {
      buildFailure = `${short}: ${(r.stderr || r.stdout || "").slice(0, 800)}`
      continue
    }

    let specCount = 0
    if (fs.existsSync(report)) {
      try {
        for (const suite of JSON.parse(fs.readFileSync(report, "utf8"))) {
          for (const s of suite.SpecReports ?? []) {
            const name = [...(s.ContainerHierarchyTexts ?? []), s.LeafNodeText].filter(Boolean).join(" > ")
            if (!name) continue
            specCount++
            if (s.State === "failed" || s.State === "panicked" || s.State === "interrupted") {
              reds.add(`${short}::${name}`)
            }
          }
        }
      } catch { /* an unparseable report is handled by the build-failure path */ }
    }

    for (const line of (r.stdout ?? "").split("\n")) {
      if (!line.startsWith("{")) continue
      let ev
      try { ev = JSON.parse(line) } catch { continue }
      if (!ev.Test || ev.Action !== "fail") continue
      // A ginkgo wrapper's failure is the sum of its specs, which are already
      // counted above with names that say what actually broke.
      if (specCount > 0 && wrappers.has(ev.Test)) continue
      reds.add(`${short}::${ev.Test}`)
    }

    // A compile error in a package with no report and no JSON events at all.
    if (r.status !== 0 && specCount === 0 && ![...reds].some((x) => x.startsWith(`${short}::`))) {
      buildFailure ??= `${short}: ${(r.stderr || r.stdout || "").slice(0, 800)}`
    }
  }

  return { reds, buildFailure }
}

/**
 * The frontend unit suites (vitest, 26 files / 462 tests).
 *
 * ~60s for the whole set, because `src/` is on the 9p bind mount and the cost
 * is transform + collect, not the tests (2.2s of the 57s). Naming `files` in
 * the manifest is therefore worth doing and is what keeps this arena in the
 * fast tier.
 */
function runVitest(cfg) {
  const out = tmpfile("vitest.json")
  const args = ["exec", "vitest", "run", "--reporter=json", `--outputFile=${out}`]
  if (cfg.files?.length) args.push(...cfg.files)
  const r = spawnSync("pnpm", args, {
    cwd: FRONTEND,
    // TEST_CONFIG_DIR is what .component.yaml's test-unittest target sets;
    // without it every file fails at import time with "Config file not defined
    // by env. variable TEST_CONFIG_DIR" — 26 files red for a reason that has
    // nothing to do with the mutation.
    env: { ...ENV, TEST_CONFIG_DIR: "data/test/config" },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  })

  const reds = new Set()
  if (!fs.existsSync(out)) {
    return { reds, buildFailure: `vitest wrote no report: ${(r.stderr || r.stdout || "").slice(0, 800)}` }
  }
  const report = JSON.parse(fs.readFileSync(out, "utf8"))
  let assertions = 0
  for (const file of report.testResults ?? []) {
    const rel = path.relative(FRONTEND, file.name).replace(/\\/g, "/")
    for (const a of file.assertionResults ?? []) {
      assertions++
      if (a.status === "failed") reds.add(`${rel}::${a.fullName}`)
    }
    // A file that fails to even load reports zero assertions and a message.
    if ((file.assertionResults ?? []).length === 0 && file.status === "failed") {
      reds.add(`${rel}::<file failed to load>`)
    }
  }
  if (assertions === 0) {
    return { reds, buildFailure: "vitest collected zero tests — the report would be vacuous" }
  }
  return { reds, buildFailure: null }
}

/**
 * The Playwright suites — journey (recipe actions) and smoke (spec titles).
 *
 * The expensive arena, and the reason the manifest routes almost everything
 * else away from it: the journey is strictly serial with chained `vars`, so a
 * mutation whose evidence lands in act 2 still cannot be reached by --grep. The
 * lever that exists is `--until-act N`, which plays acts 0..N and stops.
 *
 * A BACKEND mutation additionally needs the running backend restarted against
 * the mutated source, and a FRONTEND one needs a rebuild
 * (.claude/skills/lib/frontend-build.sh — never a bare `pnpm build`, see
 * container trap 5). Both are the caller's business, declared per entry as
 * `rebuild`, because both are minutes and neither is safe to do behind
 * someone's back while another agent may be recreating the container.
 */
function runPlaywright(cfg) {
  const suite = cfg.suite ?? "journey"

  // Getting the mutated code IN FRONT of the browser is the caller's problem,
  // and saying so beats doing it approximately. A frontend mutation must go
  // through lib/frontend-build.sh — never a bare `pnpm build`, which two
  // concurrent callers have corrupted (container trap 5). A backend mutation
  // needs the running server restarted against it, which this runner will not
  // do behind anyone's back: it is minutes, it takes the whole stack with it if
  // it goes wrong, and another agent may be mid-recreate.
  if (cfg.rebuild === "frontend") {
    const b = spawnSync("bash", [path.join(ROOT, ".claude/skills/lib/frontend-build.sh"), "build"], {
      cwd: ROOT, env: ENV, encoding: "utf8", stdio: ["ignore", "inherit", "inherit"],
    })
    if (b.status !== 0) {
      return { reds: new Set(), buildFailure: `frontend-build.sh failed (exit ${b.status})` }
    }
  } else if (cfg.rebuild === "backend") {
    return {
      reds: new Set(),
      buildFailure:
        "this entry mutates backend source, so the RUNNING backend must be restarted against it " +
        "before the suite means anything. Do that yourself (process-compose restart backend, then " +
        "wait-ready.sh) and re-run with rebuild already done — a suite driven against the " +
        "unmutated binary would report NO REDS and look exactly like an untested property.",
    }
  }

  const results = path.join(SKILL_DIR, ".artifacts/results.json")
  // A run that dies before writing its report leaves the PREVIOUS run's file on
  // disk, and reading that would report the last run's verdict as this one's —
  // green, with nothing anywhere saying the suite never ran. Remember the mtime
  // and require it to move.
  const before = fs.existsSync(results) ? fs.statSync(results).mtimeMs : 0

  const args = [path.join(SKILL_DIR, "scripts/run.sh"), suite]
  if (cfg.untilAct !== undefined) args.push("--until-act", String(cfg.untilAct))
  if (cfg.grep) args.push("--grep", cfg.grep)

  const r = spawnSync("bash", args, {
    cwd: ROOT,
    // Recording per action costs 9p writes for a 465-step serial run and has
    // failed a run outright (playwright.config.ts documents it). A mutation run
    // only needs the verdict.
    env: { ...ENV, E2E_TRACE: "off", E2E_VIDEO: "off" },
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
    maxBuffer: 256 * 1024 * 1024,
  })

  if (!fs.existsSync(results)) {
    return { reds: new Set(), buildFailure: `no .artifacts/results.json after the run (exit ${r.status})` }
  }
  if (fs.statSync(results).mtimeMs <= before) {
    return {
      reds: new Set(),
      buildFailure:
        `.artifacts/results.json was not rewritten (exit ${r.status}) — this run produced no ` +
        `report and the file on disk belongs to an earlier one.`,
    }
  }
  const report = JSON.parse(fs.readFileSync(results, "utf8"))
  const reds = new Set()
  let seen = 0
  const walk = (suites) => {
    for (const s of suites ?? []) {
      for (const spec of s.specs ?? []) {
        seen++
        const failed = (spec.tests ?? []).some((t) =>
          (t.results ?? []).some((res) => res.status === "failed" || res.status === "timedOut"),
        )
        if (!failed) continue
        // The journey names every test `[<action id>] <title>` — the action id
        // is the identity the recipe itself uses, so that is what the manifest
        // names too.
        const m = /^\[([^\]]+)\]/.exec(spec.title)
        reds.add(m ? m[1] : `${s.file ?? ""}::${spec.title}`)
      }
      walk(s.suites)
    }
  }
  walk(report.suites)
  if (seen === 0) return { reds, buildFailure: "the Playwright report contains no specs" }
  return { reds, buildFailure: null }
}

const ARENAS = {
  go: { run: runGo, tier: "fast" },
  vitest: { run: runVitest, tier: "fast" },
  journey: { run: runPlaywright, tier: "e2e" },
  smoke: { run: (cfg) => runPlaywright({ ...cfg, suite: "smoke" }), tier: "e2e" },
}

// ─── Baselines ──────────────────────────────────────────────────────────────
//
// "Exactly the expected set failed" is only meaningful against a suite that is
// green to begin with, and this one is not quite: internal/service's
// "Capacity > never oversells the last place under simultaneous joins" fails
// intermittently under in-memory SQLite. Left unhandled that flake would land
// in an arbitrary mutation's EXTRA REDS column and read as coupling.
//
// So: reds are always diffed against a baseline taken on the clean tree, and an
// unexpected red is re-checked against a FRESH clean run before it is reported
// as an extra. Nothing is dropped silently — instability is named in the output.

/**
 * Tests known to fail intermittently on a clean tree, DECLARED rather than
 * inferred, each with the reason it is here.
 *
 * The fresh-baseline re-check below is the general mechanism and it is not
 * sufficient on its own: an intermittent failure that does not reproduce in the
 * one extra sample is indistinguishable from coupling, and that is exactly what
 * happened — `cap.gate.removed` verified MISMATCH on the flake below while the
 * re-check came back green. A run that randomly fails one entry in five is a run
 * people stop reading.
 *
 * This list is a silent-drop risk of its own, so it is never silent: every hit
 * is printed with its reason on the mutation that hit it, and adding a line here
 * is a claim about the SUITE that someone has to justify — not a way to quieten
 * a mutation that is genuinely over-broad.
 *
 * ⚠ **A flaky test can still be a genuine witness**, and that trap fired within
 * an hour of this list existing. The capacity spec below hammers concurrent
 * joins against a cap — which is exactly what `capacity.oversell-by-one` breaks,
 * so under THAT mutation its failure is the evidence, not noise. The rule is:
 * when a listed test is a real witness for a mutation, it goes in that
 * mutation's `expectReds`, where the excuse does not apply (this filter only
 * ever looks at reds that are NOT expected). Excusing an extra therefore prints
 * a warning saying so, because "ignored" is the one word that could hide the
 * thing the mutation was written to find.
 */
const KNOWN_FLAKY = [
  {
    test: "service::Capacity > never oversells the last place under simultaneous joins",
    why:
      "in-memory SQLite under concurrent Join; fails as `Internal: couldn't join hackathon` " +
      "roughly 1 run in 5. Nothing to do with any mutation — see .claude/CLAUDE.md.",
  },
]
const flakyReason = (t) => KNOWN_FLAKY.find((f) => f.test === t)?.why

const baselineCache = new Map()

function baselineFor(arena, cfg, { refresh = false } = {}) {
  const key = `${arena}:${JSON.stringify(cfg ?? {})}`
  if (!refresh && baselineCache.has(key)) return baselineCache.get(key)
  process.stdout.write(C.dim(`  baseline (${arena}) … `))
  const t = Date.now()
  const { reds, buildFailure } = ARENAS[arena].run(cfg ?? {})
  if (buildFailure) throw new Error(`baseline for ${arena} could not run: ${buildFailure}`)
  console.log(C.dim(`${reds.size} red, ${((Date.now() - t) / 1000).toFixed(1)}s`))
  if (reds.size > 0) {
    console.log(C.yellow(`  note: ${reds.size} test(s) are ALREADY red on the clean tree:`))
    for (const r of reds) console.log(C.yellow(`    ${r}`))
  }
  // On a REFRESH, union rather than replace. The cached baseline accumulates
  // every test that has been caught being flaky during this run, and a fresh
  // sample that happens not to reproduce one would otherwise forget it — so the
  // next mutation would report that same flake as coupling, which is the exact
  // confusion the refresh exists to prevent.
  const prev = baselineCache.get(key)
  const merged = prev ? new Set([...prev, ...reds]) : reds
  baselineCache.set(key, merged)
  return merged
}

// ─── Manifest ───────────────────────────────────────────────────────────────

function loadManifest() {
  const lines = fs.readFileSync(MANIFEST, "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
  const muts = []
  const seen = new Set()
  lines.forEach((line, i) => {
    if (line.startsWith("//")) return
    let m
    try {
      m = JSON.parse(line)
    } catch (e) {
      throw new Error(`manifest.jsonl line ${i + 1} is not valid JSON: ${e}`)
    }
    if (m.comment && !m.id) return
    for (const field of ["id", "property", "arena"]) {
      if (m[field] === undefined) throw new Error(`manifest.jsonl line ${i + 1}: missing '${field}'`)
    }
    // `file`/`find`/`replace` is the one-edit shorthand for `edits: [{...}]`.
    // Most mutations are a single string swap; a few (weakening a sanitizer
    // that names the same tag in an allowlist AND a denylist) genuinely need
    // two, and a mutation that only half-applies would read as a well-tested
    // property when in fact the defence in depth held.
    m.edits = m.edits ?? [{ file: m.file, find: m.find, replace: m.replace, occurrences: m.occurrences }]
    for (const [j, e] of m.edits.entries()) {
      for (const field of ["file", "find", "replace"]) {
        if (e[field] === undefined) throw new Error(`${m.id}: edit #${j + 1} is missing '${field}'`)
      }
    }
    if (!ARENAS[m.arena]) throw new Error(`${m.id}: unknown arena '${m.arena}'`)
    m.expectReds = m.expectReds ?? []
    if (seen.has(m.id)) throw new Error(`manifest.jsonl: duplicate mutation id '${m.id}'`)
    seen.add(m.id)
    // An entry with no expected reds is a CLAIM THAT NOTHING TESTS THIS, and
    // has to say so out loud. Without this, "expectReds: []" would be the one
    // value that makes every mutation pass — the exact shape of vacuous green
    // this tool exists to find.
    if ((m.expectReds ?? []).length === 0 && !m.gap) {
      throw new Error(
        `${m.id}: has no expectReds and is not marked "gap": true. An entry that ` +
          `expects nothing to fail would pass no matter what the code does.`,
      )
    }
    if (m.gap && (m.expectReds ?? []).length > 0) {
      throw new Error(`${m.id}: marked as a gap but also lists expectReds — pick one.`)
    }
    if (m.gap && !m.gapReason) throw new Error(`${m.id}: a gap must carry a 'gapReason'.`)
    muts.push(m)
  })
  return muts
}

function tierOf(m) {
  return m.tier ?? ARENAS[m.arena].tier
}

// ─── Running one mutation ───────────────────────────────────────────────────

function evaluate(m, { record, wide }) {
  const arena = ARENAS[m.arena]
  // `arenaConfig.files` (vitest) and `arenaConfig.packages` (go) narrow a run to
  // where the property lives, which is what keeps an arena in the fast tier —
  // vitest drops from 60s to ~10s, and a go mutation confined to one package
  // skips recompiling the rest.
  //
  // The cost is real and is named here rather than left to be discovered: a test
  // OUTSIDE the narrowed set cannot be seen going red, so narrowing scopes the
  // EXTRA REDS half of the check too — and that half is the one that finds
  // coupling. Neither default is narrowed; `--wide` drops any narrowing an entry
  // asked for and pays for the breadth.
  const cfg = wide
    ? { ...(m.arenaConfig ?? {}), files: undefined, packages: undefined }
    : (m.arenaConfig ?? {})
  const base = baselineFor(m.arena, cfg)

  assertCleanTree(`before ${m.id}`)
  apply(m)
  let result
  try {
    process.stdout.write(C.dim(`  mutated  (${m.arena}) … `))
    const t = Date.now()
    result = arena.run(cfg)
    console.log(C.dim(`${result.reds.size} red, ${((Date.now() - t) / 1000).toFixed(1)}s`))
  } finally {
    restore({ quiet: true })
  }
  assertCleanTree(`after ${m.id}`)

  if (result.buildFailure) {
    return { verdict: "INVALID", detail: `the mutated source does not build:\n${result.buildFailure}` }
  }

  let newReds = [...result.reds].filter((r) => !base.has(r)).sort()
  const expected = (m.expectReds ?? []).slice().sort()

  let unstable = []
  const extras = newReds.filter((r) => !expected.includes(r))
  if (extras.length > 0 && !record) {
    // Two filters, in cost order. The declared list first, because it is free
    // and covers the flake we have already paid to diagnose. Then, for anything
    // still unexplained, ask the CLEAN tree again — a flake reported as coupling
    // costs a person an afternoon.
    unstable = extras.filter((r) => flakyReason(r) !== undefined)
    const rest = extras.filter((r) => !unstable.includes(r))
    if (rest.length > 0) {
      const fresh = baselineFor(m.arena, cfg, { refresh: true })
      unstable = [...unstable, ...rest.filter((r) => fresh.has(r))]
    }
    if (unstable.length > 0) {
      newReds = newReds.filter((r) => !unstable.includes(r))
      for (const r of unstable) base.add(r)
    }
  }

  const missing = expected.filter((r) => !newReds.includes(r))
  const extra = newReds.filter((r) => !expected.includes(r))

  if (record) return { verdict: "RECORD", observed: newReds, unstable }
  if (newReds.length === 0) {
    return {
      verdict: m.gap ? "GAP" : "NO REDS",
      detail: m.gap ? m.gapReason : undefined,
      observed: newReds,
      unstable,
    }
  }
  if (m.gap) {
    return {
      verdict: "GAP CLOSED",
      detail: `marked as a gap, but these went red: ${newReds.join(", ")}. Promote it to a real entry.`,
      observed: newReds,
      unstable,
    }
  }
  if (missing.length === 0 && extra.length === 0) {
    return { verdict: "EXACT", observed: newReds, unstable }
  }
  return { verdict: "MISMATCH", missing, extra, observed: newReds, unstable }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const VERDICT_OK = new Set(["EXACT", "GAP", "RECORD"])

function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0] ?? "run"

  if (cmd === "restore") {
    const n = restore()
    if (n === 0) console.log("nothing to restore — the journal is empty")
    return 0
  }

  const muts = loadManifest()
  setMutableScope(muts)

  if (cmd === "list") {
    for (const m of muts) {
      console.log(
        `${C.bold(m.id.padEnd(30))} ${tierOf(m).padEnd(5)} ${m.arena.padEnd(8)} ` +
          `${m.gap ? C.yellow("GAP  ") : `${String(m.expectReds.length).padStart(2)} red`}  ${m.property}`,
      )
    }
    console.log(`\n${muts.length} mutations`)
    return 0
  }

  // Anchors rot. Every mutation names a literal fragment of product source, and
  // the day one stops matching is the day this manifest quietly stops testing
  // anything — so `check` exists to be cheap enough to run on every commit.
  if (cmd === "check") {
    let bad = 0
    for (const m of muts) {
      for (const [i, e] of m.edits.entries()) {
        const abs = path.join(ROOT, e.file)
        if (!fs.existsSync(abs)) { console.error(C.red(`${m.id}: no such file ${e.file}`)); bad++; continue }
        const n = fs.readFileSync(abs, "utf8").split(e.find).length - 1
        const want = e.occurrences ?? 1
        if (n !== want) {
          console.error(C.red(`${m.id}: anchor #${i + 1} matches ${n}x in ${e.file} (want ${want})`))
          console.error(C.dim(`    ${JSON.stringify(e.find)}`))
          bad++
        }
      }
    }
    console.log(bad === 0 ? C.green(`all ${muts.length} mutations still anchor`) : C.red(`${bad} broken anchor(s)`))
    return bad === 0 ? 0 : 1
  }

  if (cmd !== "run") {
    console.error(
      [
        "usage: run.mjs [list|check|run|restore] [ids...]",
        "  --tier fast|e2e|all   fast = go + vitest, needs no stack (default)",
        "  --arena go|vitest|journey|smoke",
        "  --wide                ignore arenaConfig narrowing, so EXTRA REDS are checked suite-wide",
        "  --record              print the reds instead of judging them (authoring aid)",
        "  --json FILE           write the results table",
      ].join("\n"),
    )
    return 2
  }

  const flags = { tier: "fast", arena: null, record: false, json: null, wide: false }
  const ids = []
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--tier") flags.tier = argv[++i]
    else if (a === "--arena") flags.arena = argv[++i]
    else if (a === "--record") flags.record = true
    else if (a === "--wide") flags.wide = true
    else if (a === "--json") flags.json = argv[++i]
    else if (a.startsWith("--")) { console.error(`unknown flag ${a}`); return 2 }
    else ids.push(a)
  }

  let selected = muts
  if (ids.length > 0) {
    selected = muts.filter((m) => ids.some((id) => m.id === id || m.id.startsWith(`${id}.`)))
    const unknown = ids.filter((id) => !muts.some((m) => m.id === id || m.id.startsWith(`${id}.`)))
    if (unknown.length) { console.error(`unknown mutation id(s): ${unknown.join(", ")}`); return 2 }
  } else {
    if (flags.tier !== "all") selected = selected.filter((m) => tierOf(m) === flags.tier)
    if (flags.arena) selected = selected.filter((m) => m.arena === flags.arena)
  }
  if (selected.length === 0) { console.error("no mutations selected"); return 2 }

  refuseIfDirty()
  captureDirtyBaseline()
  installCleanup()
  // A journal left over from a run that was killed outright.
  if (readJournal().length > 0) {
    console.log(C.yellow("a previous run left mutations applied — restoring them first"))
    restore()
  }

  console.log(C.bold(`\n${selected.length} mutation(s)\n`))
  const rows = []
  for (const m of selected) {
    console.log(C.bold(`── ${m.id}`))
    console.log(C.dim(`  ${m.property}`))
    let r
    try {
      r = evaluate(m, { record: flags.record, wide: flags.wide })
    } catch (e) {
      r = { verdict: "ERROR", detail: String(e?.message ?? e) }
    }
    rows.push({ id: m.id, arena: m.arena, tier: tierOf(m), property: m.property, ...r })

    const paint =
      r.verdict === "EXACT" ? C.green
      : r.verdict === "GAP" ? C.yellow
      : r.verdict === "RECORD" ? C.dim
      : C.red
    console.log(`  ${paint(r.verdict)}`)
    if (r.verdict === "RECORD") {
      console.log(`  ${C.dim("observed:")} ${JSON.stringify(r.observed)}`)
    }
    if (r.missing?.length) console.log(C.red(`  expected but stayed GREEN:\n${r.missing.map((x) => `    ${x}`).join("\n")}`))
    if (r.extra?.length) console.log(C.red(`  went red unexpectedly:\n${r.extra.map((x) => `    ${x}`).join("\n")}`))
    if (r.unstable?.length) {
      // Never silent. An ignored red is a claim, and it has to state its reason.
      console.log(C.yellow("  ignored as flaky (not counted as caused by this mutation):"))
      for (const x of r.unstable) {
        console.log(C.yellow(`    ${x}`))
        if (flakyReason(x)) {
          console.log(C.dim(`      declared in KNOWN_FLAKY: ${flakyReason(x)}`))
          console.log(
            C.dim(
              `      if this test is a REAL witness for this mutation, put it in ` +
                `expectReds — the excuse only applies to unexpected reds.`,
            ),
          )
        } else {
          console.log(C.dim(`      also red on a fresh run of the clean tree`))
        }
      }
    }
    if (r.detail) console.log(C.dim(`  ${r.detail.replace(/\n/g, "\n  ")}`))
    console.log()
  }

  assertCleanTree("at the end of the run")

  console.log(C.bold("── Results ──────────────────────────────────────────────"))
  for (const r of rows) {
    const paint =
      r.verdict === "EXACT" ? C.green
      : r.verdict === "GAP" ? C.yellow
      : r.verdict === "RECORD" ? C.dim
      : C.red
    console.log(`  ${paint(r.verdict.padEnd(11))} ${r.id.padEnd(30)} ${r.arena}`)
  }
  const bad = rows.filter((r) => !VERDICT_OK.has(r.verdict))
  const noReds = rows.filter((r) => r.verdict === "NO REDS")
  console.log()
  console.log(
    `  ${rows.length} run — ` +
      `${C.green(`${rows.filter((r) => r.verdict === "EXACT").length} exact`)}, ` +
      `${C.yellow(`${rows.filter((r) => r.verdict === "GAP").length} known gaps`)}, ` +
      `${C.red(`${noReds.length} untested properties`)}, ` +
      `${C.red(`${bad.length - noReds.length} other failures`)}`,
  )
  if (noReds.length > 0) {
    console.log(
      C.red(
        `\n  NO REDS means the property below is not tested by anything in its arena.\n` +
          `  That is a finding about the suite, not a bug in this tool:\n` +
          noReds.map((r) => `    ${r.id}: ${r.property}`).join("\n"),
      ),
    )
  }

  if (flags.json) {
    fs.mkdirSync(path.dirname(path.resolve(flags.json)), { recursive: true })
    fs.writeFileSync(path.resolve(flags.json), JSON.stringify({ at: new Date().toISOString(), rows }, null, 2))
    console.log(C.dim(`\n  wrote ${flags.json}`))
  }

  return bad.length > 0 ? 1 : 0
}

process.exitCode = main()
