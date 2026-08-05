#!/usr/bin/env node
/**
 * Rewrites Skeleton v3 classes to Hackagon theme classes.
 *
 * This ran once to migrate the app off Skeleton. It is kept only because
 * branches cut before that migration still carry Skeleton classes, and
 * re-running it on those files is far more reliable than hand-editing them.
 * Delete it once no such branch is left.
 *
 * This is a migration tool, not documentation of the theme. The theme itself is
 * defined in src/themes/hackagon.css and explained by the frontend-theme skill.
 *
 *   node scripts/migrate-skeleton-classes.mjs [paths...]
 *   node scripts/migrate-skeleton-classes.mjs --dry src
 *
 * Defaults to `src`. Always read the resulting diff: the `preset-*` classes are
 * context-dependent (the same class is a button here and a badge there), and the
 * context sniffing below is good but not infallible.
 */
import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const dry = args.includes("--dry")
const targets = args.filter((a) => a !== "--dry")
const roots = targets.length ? targets : ["src"]

/* ------------------------------------------------------------------ *
 * 1. Colour utilities. Purely mechanical: a numeric step and its
 *    mode-flipped partner become one semantic token.
 * ------------------------------------------------------------------ */
const COLOR = {
  "bg-surface-50-950": "bg-surface",
  "bg-surface-100-900": "bg-raised",
  "bg-surface-200-800": "bg-overlay",
  "bg-surface-300-700": "bg-overlay",
  "border-surface-200-800": "border-line",
  "border-surface-300-700": "border-line-strong",
  "divide-surface-200-800": "divide-line",
  "ring-surface-50-950": "ring-surface",
  "text-surface-950-50": "text-ink",
  "text-surface-800-200": "text-ink-2",
  "text-surface-700-300": "text-ink-2",
  "text-surface-600-400": "text-ink-2",
  "text-surface-700": "text-ink-2",
  "text-surface-500": "text-ink-3",
  "text-surface-400": "text-ink-3",

  "bg-primary-500": "bg-accent",
  "border-primary-500": "border-accent",
  "border-primary-950-50": "border-line",
  "text-primary-700-300": "text-accent-ink",
  "text-primary-600-400": "text-accent-ink",
  "text-primary-500": "text-accent-ink",

  "text-error-500": "text-danger-ink",
  "text-error-300": "text-danger-ink",
  "bg-warning-500": "bg-warning",
  "border-warning-500": "border-warning",
  "text-warning-700-300": "text-warning-ink",
  "text-warning-600-400": "text-warning-ink",
  "text-warning-500": "text-warning-ink",
  "text-success-700-300": "text-success-ink",

  "text-secondary-700-300": "text-info-ink",
  "text-secondary-500": "text-info-ink",
  "text-tertiary-700-300": "text-info-ink",
  "text-tertiary-500": "text-info-ink",
}

/* ------------------------------------------------------------------ *
 * 2. Presets. The same preset means different things depending on
 *    whether it sits on a button, a badge, a chip or a bare element,
 *    so each context gets its own table. `null` means "drop it" —
 *    the component class already supplies that styling.
 * ------------------------------------------------------------------ */
const BTN = {
  "preset-filled-primary-500": "btn-solid",
  "preset-filled-surface-50-950": "btn-outline",
  "preset-filled-warning-500": "btn-warning",
  "preset-filled-error-500": "btn-danger-solid",
  "preset-outlined-primary-500": "btn-outline-accent",
  "preset-outlined-surface-200-800": "btn-outline",
  "preset-outlined-error-500": "btn-danger",
  "preset-tonal-surface": "btn-ghost",
  "preset-tonal-primary": "btn-accent",
  "preset-tonal-secondary": "btn-quiet",
  "preset-tonal-tertiary": "btn-quiet",
  "preset-tonal-success": "btn-success",
  "preset-tonal-warning": "btn-warning",
  "preset-tonal-error": "btn-danger",
  "preset-tonal": "btn-quiet",
}

const BADGE = {
  "preset-filled-primary-500": "badge-solid",
  "preset-filled-surface-50-950": "badge-neutral",
  "preset-filled-warning-500": "badge-warning",
  "preset-filled-error-500": "badge-danger",
  "preset-outlined-primary-500": "badge-outline-accent",
  "preset-outlined-surface-200-800": "badge-neutral",
  "preset-outlined-error-500": "badge-danger",
  "preset-tonal-surface": "badge-neutral",
  "preset-tonal-primary": "badge-accent",
  "preset-tonal-secondary": "badge-info",
  "preset-tonal-tertiary": "badge-info",
  "preset-tonal-success": "badge-success",
  "preset-tonal-warning": "badge-warning",
  "preset-tonal-error": "badge-danger",
  "preset-tonal": "badge-neutral",
}

const CHIP = {
  "preset-tonal-primary": "chip-active",
  "preset-tonal-surface": null,
  "preset-tonal": null,
}

// `.card` already carries surface + hairline, so its presets are redundant.
const CARD = {
  "preset-outlined-surface-200-800": null,
  "preset-filled-surface-50-950": null,
}

// No component class to hang a variant off — emit plain utilities instead.
const BARE = {
  "preset-tonal-surface": "bg-raised text-ink",
  "preset-tonal-primary": "bg-accent/20 text-accent-ink",
  "preset-tonal-secondary": "bg-info/20 text-info-ink",
  "preset-tonal-tertiary": "bg-info/20 text-info-ink",
  "preset-tonal-success": "bg-success/20 text-success-ink",
  "preset-tonal-warning": "bg-warning/20 text-warning-ink",
  "preset-tonal-error": "bg-danger/20 text-danger-ink",
  "preset-filled-primary-500": "bg-accent text-on-accent",
  "preset-filled-surface-50-950": "bg-surface text-ink",
  "preset-outlined-surface-200-800": "border border-line",
  "preset-outlined-primary-500": "border border-accent text-accent-ink",
  "preset-tonal": "bg-raised text-ink",
}

function tableFor(context) {
  if (/\bbtn\b|\bbtn-/.test(context)) return BTN
  if (/\bbadge\b|\bbadge-icon\b|Preset|Variant|BADGE_|_PRESET/.test(context))
    return BADGE
  if (/\bchip\b/.test(context)) return CHIP
  if (/\bcard\b/.test(context)) return CARD
  return BARE
}

/** The token's surrounding class attribute or string literal, for context. */
function contextAround(text, index) {
  const attr = /\bclass\s*=\s*"([^"]*)"/g
  let m
  while ((m = attr.exec(text))) {
    if (index >= m.index && index < m.index + m[0].length) return m[1]
  }
  const lineStart = text.lastIndexOf("\n", index) + 1
  let lineEnd = text.indexOf("\n", index)
  if (lineEnd === -1) lineEnd = text.length
  // A preset in a lookup table is a badge variant; the line names the map.
  return text.slice(Math.max(0, lineStart - 200), lineEnd)
}

const guarded = (cls) =>
  new RegExp(
    `(?<![\\w-])${cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
    "g",
  )

function migrate(text) {
  let out = text

  // Colours first: no context needed, longest key first so that
  // `text-surface-500` never eats the head of `text-surface-500-400`.
  for (const key of Object.keys(COLOR).sort((a, b) => b.length - a.length)) {
    out = out.replace(guarded(key), COLOR[key])
  }

  // Presets, resolved against their surrounding context.
  const presetRe = /(hover:|focus:|active:|group-hover:)?(preset-[a-z0-9-]+)/g
  out = out.replace(presetRe, (match, variantPrefix, preset, offset) => {
    const table = tableFor(contextAround(out, offset))
    if (!(preset in table)) return match
    const replacement = table[preset]
    if (replacement === null) return ""
    // A variant's own :hover rule replaces the `hover:` prefixed preset, so the
    // prefix is dropped rather than carried over.
    return replacement
  })

  // Skeleton's `btn-icon` and `btn-sm` stood alone; ours are modifiers that need
  // `.btn` for the layout. `\bbtn\b` is no use as the "already there?" test —
  // `-` is a non-word character, so it matches inside `btn-icon` itself.
  const hasBtnBase = (cls) => /(?<![\w-])btn(?![\w-])/.test(cls)
  out = out.replace(/\bclass\s*=\s*"([^"]*)"/g, (m, cls) => {
    if (hasBtnBase(cls)) return m
    const modifier = cls.match(/(?<![\w-])btn-(?:icon|sm|lg)(?![\w-])/)
    if (!modifier) return m
    return m.replace(cls, cls.replace(modifier[0], `btn ${modifier[0]}`))
  })

  // Tidy the whitespace the dropped classes left behind, inside attrs only.
  // Class attributes are frequently wrapped across lines, so each line keeps
  // its own indentation — collapsing that would reflow every wrapped attribute
  // in the codebase and bury the real change in whitespace noise.
  out = out.replace(/\bclass\s*=\s*"([^"]*)"/g, (m, cls) => {
    const tidy = cls
      .split("\n")
      .map((line, i) => {
        const indent = i === 0 ? "" : (line.match(/^[ \t]*/) ?? [""])[0]
        const body = line
          .slice(indent.length)
          .replace(/[ \t]{2,}/g, " ")
          .replace(/[ \t]+$/, "")
        return indent + body
      })
      .join("\n")
      .replace(/^[ \t]+/, "")
    return tidy === cls ? m : m.replace(cls, tidy)
  })

  return out
}

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) {
      if (!/node_modules|\/generated|\.svelte-kit|build/.test(p)) walk(p, out)
    } else if (/\.(svelte|ts|html)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = roots.flatMap((r) =>
  fs.statSync(r).isDirectory() ? walk(r) : [r],
)

let changed = 0
for (const f of files) {
  const before = fs.readFileSync(f, "utf8")
  const after = migrate(before)
  if (before === after) continue
  changed++
  console.log((dry ? "would change  " : "changed  ") + f)
  if (!dry) fs.writeFileSync(f, after)
}
console.log(
  `\n${changed} file(s) ${dry ? "would be " : ""}changed of ${files.length} scanned.`,
)
