#!/usr/bin/env node
// Turn a captured RPC journal (components/backend/internal/audit) into DRAFT
// recipe actions.
//
// What it does:
//   - copies actor / method / params / expect straight across; the journal
//     was deliberately written in the recipe's own field names;
//   - substitutes ids for recipe templates. An id first seen in a call's
//     `produced` map becomes a variable, and every later occurrence of that
//     UUID — anywhere in any params tree — is rewritten to the token. The
//     defining call gets the matching `save`;
//   - leaves id / title / outcome / priority / act / t as EMPTY placeholders.
//
// What it deliberately does NOT do: write prose. A generated `outcome` that
// reads plausible but was never thought about is worse than a blank one — the
// recipe's whole value is the human judgement about what SHOULD happen, and a
// draft that looks finished is a draft nobody re-reads.
//
// Usage:
//   node journal-to-recipe.mjs <journal.jsonl> [options]
//     --out <file>     write drafts here (default: stdout)
//     --dedupe         collapse runs of identical (actor, method, params)
//     --keep-health    keep health.HealthService/Check lines (dropped by
//                      default: the readiness probe, not an action)
//     --keep-reads     keep Get/List/WhoAmI calls (dropped by default: the
//                      frontend issues them on every page load)
//     --from-seq <n>   ignore everything before sequence n. The e2e harness
//                      opens with scripts/probe.sh, which calls every gated
//                      method once with '{}' to see what exists — traffic the
//                      journal cannot tell from somebody doing it on purpose.

import fs from "node:fs"

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
// Same shape, unanchored, for "does this blob contain a uuid anywhere".
const UUID_ANYWHERE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/

// Journal lines that are traffic rather than intent. Dropping these is the one
// editorial judgement this script makes, and both are reversible by flag.
const HEALTH = "health.HealthService/Check"
const READ_METHOD = /\/(Get|List|WhoAmI|Preview|Export|Suggest)[A-Za-z]*$/

// ─── argv ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const opts = { dedupe: false, keepHealth: false, keepReads: false, out: null, fromSeq: 0 }
let journalPath = null
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--dedupe") opts.dedupe = true
  else if (a === "--keep-health") opts.keepHealth = true
  else if (a === "--keep-reads") opts.keepReads = true
  else if (a === "--out") opts.out = argv[++i]
  else if (a === "--from-seq") opts.fromSeq = Number(argv[++i])
  else if (a === "-h" || a === "--help") {
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 31).join("\n"))
    process.exit(0)
  } else if (a.startsWith("-")) {
    console.error(`unknown option: ${a}`)
    process.exit(2)
  } else journalPath = a
}
if (!journalPath) {
  console.error("usage: journal-to-recipe.mjs <journal.jsonl> [--out f] [--dedupe] [--keep-health] [--keep-reads]")
  process.exit(2)
}

// ─── read ────────────────────────────────────────────────────────────────────

const raw = fs
  .readFileSync(journalPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)

const entries = []
let malformed = 0
for (const line of raw) {
  try {
    entries.push(JSON.parse(line))
  } catch {
    malformed++
  }
}
entries.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

const captured = entries.length
let dropped = { health: 0, reads: 0, dupes: 0, early: 0 }

let kept = entries.filter((e) => {
  if (opts.fromSeq && (e.seq ?? 0) < opts.fromSeq) return (dropped.early++, false)
  if (!opts.keepHealth && e.method === HEALTH) return (dropped.health++, false)
  if (!opts.keepReads && READ_METHOD.test("/" + (e.method ?? ""))) return (dropped.reads++, false)
  return true
})

if (opts.dedupe) {
  const out = []
  let prev = null
  for (const e of kept) {
    const sig = `${e.actor}|${e.method}|${JSON.stringify(e.params)}|${JSON.stringify(e.expect)}`
    if (sig === prev) {
      dropped.dupes++
      continue
    }
    prev = sig
    out.push(e)
  }
  kept = out
}

// ─── binding: UUID -> template token ─────────────────────────────────────────
//
// One pass in journal order. A UUID is BOUND the first time a response reports
// it; from then on every params occurrence is rewritten. Reads are used for
// binding even when they are filtered out of the output — WhoAmI is where a
// person's DB id becomes knowable, and dropping it from the draft must not
// cost us {{userId:alice}}.

const binding = new Map() // uuid -> template token, e.g. "{{hackathonId}}"
const definedBy = new Map() // uuid -> { entry, path, varName }
const usedVars = new Set()

// A person's DB uuid is named after WHO it belongs to, which is knowable
// exactly here: WhoAmI/Register answer for their own caller.
const SELF_ID = /\/(WhoAmI|Register)$/

function varNameFor(entry, path) {
  const method = entry.method ?? ""
  const short = method.split("/").pop() ?? ""
  const leaf = path.split(".").pop() ?? "id"
  if (SELF_ID.test("/" + method) && entry.actor && entry.actor !== "anonymous") {
    return { token: `{{userId:${entry.actor}}}`, save: null }
  }
  // {{hackathonId}} is the recipe's one bare token and it names THE event the
  // story is about. The journey also creates a second, private hackathon, and
  // binding both to the same token silently rewrote every later reference to
  // the draft into a reference to the main event — a draft that looks right
  // and is wrong. Only the first Create claims it; the rest fall through.
  if (leaf === "hackathonId" && short === "Create" && !usedVars.has("hackathonId")) {
    usedVars.add("hackathonId")
    return { token: "{{hackathonId}}", save: "hackathonId" }
  }
  const base = leaf === "id" ? lowerFirst(entry.method.split(".").pop().split("/")[0].replace(/Service$/, "")) : leaf
  let name = `${base}${short === "Create" || short === "Propose" ? "" : capitalize(short)}`
  let n = 1
  let candidate = name
  while (usedVars.has(candidate)) candidate = `${name}${++n}`
  usedVars.add(candidate)
  return { token: `{{var:${candidate}}}`, save: candidate }
}

const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s)
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

for (const e of entries) {
  for (const [path, uuid] of Object.entries(e.produced ?? {})) {
    if (binding.has(uuid)) continue
    const { token, save } = varNameFor(e, path)
    binding.set(uuid, token)
    definedBy.set(uuid, { entry: e, path, save })
  }
}

// ─── rewrite params ──────────────────────────────────────────────────────────

const untemplated = new Map() // uuid -> count of params occurrences with no binding

function templateValue(v) {
  if (typeof v === "string") {
    if (UUID.test(v)) {
      const bound = binding.get(v)
      if (bound) return bound
      untemplated.set(v, (untemplated.get(v) ?? 0) + 1)
      return v
    }
    return v
  }
  if (Array.isArray(v)) return v.map(templateValue)
  if (v && typeof v === "object") {
    const out = {}
    for (const [k, val] of Object.entries(v)) out[k] = templateValue(val)
    return out
  }
  return v
}

// `save` is emitted only for variables something downstream actually uses —
// a Create whose id is never referenced again needs no variable.
const referenced = new Set()
for (const e of kept) {
  JSON.stringify(e.params ?? {}, (k, v) => {
    if (typeof v === "string" && UUID.test(v) && binding.has(v)) referenced.add(v)
    return v
  })
}

const drafts = []
let templatedCalls = 0
let manualCalls = 0

for (const e of kept) {
  const before = untemplated.size
  const params = templateValue(e.params ?? {})
  const grew = untemplated.size > before

  const saves = {}
  for (const [path, uuid] of Object.entries(e.produced ?? {})) {
    const def = definedBy.get(uuid)
    if (!def || def.entry !== e || !def.save) continue
    if (!referenced.has(uuid)) continue
    saves[def.save] = path
  }

  // Only calls that carried an id at all can be "templated" or "manual" —
  // a Create with no id in its request is neither.
  if (UUID_ANYWHERE.test(JSON.stringify(e.params ?? {}))) {
    if (grew || UUID_ANYWHERE.test(JSON.stringify(params))) manualCalls++
    else templatedCalls++
  }

  const draft = {
    id: "",
    priority: "",
    implement: true,
    outcome: "",
    act: null,
    t: "",
    title: "",
    actor: e.actor,
    action: "rpc",
    method: e.method,
    params,
    expect: e.expect,
  }
  if (Object.keys(saves).length > 0) draft.save = saves
  draft._journalSeq = e.seq
  drafts.push(draft)
}

// ─── output ──────────────────────────────────────────────────────────────────

const body = drafts.map((d) => JSON.stringify(d)).join("\n") + "\n"
if (opts.out) fs.writeFileSync(opts.out, body)
else process.stdout.write(body)

// ─── summary ─────────────────────────────────────────────────────────────────
// The last line is the one that matters: ids never seen created are exactly
// the actions a human has to fix by hand.

const log = (s) => process.stderr.write(s + "\n")
log(
  `captured ${captured} journal lines` +
    (malformed ? ` (${malformed} malformed, skipped)` : "") +
    ` -> ${drafts.length} draft actions` +
    ` [dropped: ${dropped.health} health, ${dropped.reads} reads` +
    (opts.dedupe ? `, ${dropped.dupes} repeats` : "") +
    (opts.fromSeq ? `, ${dropped.early} before seq ${opts.fromSeq}` : "") +
    `]`,
)
log(
  `bound ${binding.size} ids from responses; ${templatedCalls} calls fully templated, ` +
    `${manualCalls} carry a literal id`,
)
if (untemplated.size === 0) {
  log("UNTEMPLATED: none — every id in every draft came from a call in this journal.")
} else {
  const sample = [...untemplated.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([u, n]) => `${u}(x${n})`)
  log(
    `UNTEMPLATED: ${untemplated.size} id(s) never seen created — fix by hand: ${sample.join(" ")}` +
      (untemplated.size > 5 ? ` +${untemplated.size - 5} more` : ""),
  )
}
