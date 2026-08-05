---
name: frontend-theme
description:
  The Hackagon visual system — semantic colour tokens, the mono/sans type roles,
  the .btn/.badge/.card/.field/.chip component classes and their variants, the
  design intent behind them, and the rules that keep them coherent (one solid
  accent per view, accent is never a status, no hand-rolled dark-mode swaps).
  Use when styling any UI, picking a colour or a size, adding a component class,
  or reviewing a diff for visual consistency. For route structure, runes and the
  dev commands see frontend-dev.
---

# Hackagon theme

The app owns its visual system outright — there is no UI framework underneath
it.

## Where the theme is defined

`components/frontend/src/themes/hackagon.css` is the single source of truth,
imported by `src/app.css`. Nothing else defines colour, type or radius, and no
component should introduce a literal colour value. The file is organised in
cascade order:

| Part                | What it holds                                                                |
| ------------------- | ---------------------------------------------------------------------------- |
| `:root`             | the `--hk-*` tokens, dark mode (the default)                                 |
| `[data-mode=light]` | the same token names, light values                                           |
| `@theme inline`     | maps `--hk-*` onto Tailwind's `--color-*` so utilities generate              |
| `@theme`            | fonts, the type scale, radii, `--spacing`                                    |
| `@layer base`       | element defaults: body, headings, anchors, focus ring, default border colour |
| `@layer components` | `.prose` `.meta` `.tnum` `.btn` `.badge` `.card` `.field` `.chip` + variants |

The `inline` on the first `@theme` is load-bearing: it makes each generated
utility resolve `--hk-*` at use time instead of baking in a copy, which is what
lets `[data-mode="light"]` re-point every utility at once. Without it, mode
switching silently stops working.

Colour mode is `data-mode="dark"|"light"` on `<html>`, defaulted in `app.html`
and flipped by `LightSwitch.svelte`. Dark is the default.

## Design intent

The values are in the CSS; the reasoning is not, and it is what keeps future
choices consistent with past ones.

- **The ground is a cyan-slate, not a neutral grey.** All surface tokens sit at
  hue `196` with low chroma. A dead-neutral ground under a high-chroma lime is
  what makes an accent read as neon rather than chosen; 65° between ground and
  accent makes the lime look deliberate. (The hue is not arbitrary — the
  previous palette already carried `196deg` on its darkest greys at chroma 0,
  where hue has no effect.)
- **The accent is restrained on purpose.** Lime at hue `131`, chroma `0.155`
  rather than the `0.18` it used to be. It reaches full strength only on small
  solid marks, so extra saturation bought nothing but louder large fills.
- **`accent` and `accent-ink` are deliberately different colours.** A solid
  accent field stays bright in both modes because it carries dark ink; the same
  accent used as _text_ has to darken in light mode to stay legible. One token
  cannot do both jobs.
- **Status hues are kept away from the accent.** Success is a teal at `168`, not
  the green at `141` it used to be — 11° from the brand lime meant a status
  colour read as the brand colour. Status is `success` / `warning` / `danger` /
  `info` and nothing else; there is no `secondary` or `tertiary`.
- **Mono is the voice, sans is for sentences.** Mono carries headings, labels,
  counts and IDs — anything scanned. Sans carries anything read as a sentence.
  Mono at paragraph length is tiring, and with headings in it too there is no
  contrast left to build hierarchy from.
- **Controls are round, frames are not.** Pill controls against 6px cards and
  1px hairlines makes the roundness read as a deliberate contrast rather than a
  global softening.
- **Depth is lightness and hairlines, never shadow.** Four background steps and
  a 1px line do all the layering.

Both faces are system stacks, so there is no webfont request and no flash of
unstyled text.

## Colour: use a token, never a raw value

Every colour is a semantic token that already flips with the mode. There is no
numeric palette and no `-100-900`-style pair.

| Token                               | Example utility   | For                                     |
| ----------------------------------- | ----------------- | --------------------------------------- |
| `canvas`                            | `bg-canvas`       | page background                         |
| `surface`                           | `bg-surface`      | cards, nav, sidebar                     |
| `raised`                            | `bg-raised`       | inputs, hover, table headers            |
| `overlay`                           | `bg-overlay`      | the step above `raised`                 |
| `line` / `line-strong`              | `border-line`     | hairlines; `-strong` for outlined ctrls |
| `ink` / `ink-2` / `ink-3`           | `text-ink-2`      | primary / body / labels and meta        |
| `accent`                            | `bg-accent`       | the one solid primary action            |
| `accent-ink`                        | `text-accent-ink` | the accent used **as text**             |
| `on-accent`                         | `text-on-accent`  | ink that sits on a solid accent field   |
| `success` `warning` `danger` `info` | `bg-warning`      | status, solid                           |
| `…-ink`                             | `text-danger-ink` | status, as text                         |
| `scrim`                             | `bg-scrim`        | the wash behind a drawer or dialog      |

Opacity modifiers work and are the right way to get a tonal field:
`bg-warning/10`, `bg-accent/25`. Do not invent a token for it.

## Type

| Class          | Face | For                                          |
| -------------- | ---- | -------------------------------------------- |
| `text-display` | mono | page title                                   |
| `text-title`   | mono | major heading                                |
| `text-section` | mono | section heading, card title                  |
| `text-body`    | —    | body size                                    |
| `text-meta`    | mono | small uppercase label (see also `.meta`)     |
| `.prose`       | sans | running text; caps the measure at `68ch`     |
| `.meta`        | mono | uppercase eyebrow / attribute label, `ink-3` |
| `.tnum`        | —    | tabular numerals                             |

Each mono display step carries its own negative tracking, because mono needs it
as it scales up. `h1`–`h6` already get the mono face, weight and
`text-wrap: balance` from the base layer, so you only add a size — and that size
comes from the scale, never from `text-lg`/`text-xl`/`text-2xl`. Do not pair one
with `font-bold`: the steps set weight 600 and `font-bold` silently overrides it
to 700, which is how a scale ends up defined but unused.

## Component classes

`.btn` is the shape; a variant supplies the colour. Modifiers (`btn-sm`,
`btn-icon`) need the `btn` base — they do not stand alone.

- **Buttons** — `btn-solid` (accent field), `btn-outline`, `btn-outline-accent`,
  `btn-ghost` (filled quiet), `btn-quiet` (transparent until hover),
  `btn-accent` / `btn-success` / `btn-warning` (tonal), `btn-danger` (outlined),
  `btn-danger-solid`. Sizes: `btn-sm`; shape: `btn-icon`.
- **Badges** — `badge` + `badge-solid`, `badge-accent`, `badge-outline-accent`,
  `badge-neutral`, `badge-success`, `badge-warning`, `badge-danger`,
  `badge-info`. `badge-icon` for a bare count.
- **Surfaces** — `.card` (surface + hairline + 6px radius), `.card-raised` for
  the same card one lightness step up, which is what rows in a list sitting
  directly on the canvas want. Do not also add `border border-line` or a `bg-*`;
  the class carries both.
- **Inputs** — `.field`, plus `.field-area` for anything that wraps (textareas
  and the panes rendered beside them — it drops the fixed control height).
  Padding overrides compose: `class="field pl-9 pr-3"`.
- **Form labels** — `.field-label`, the caption-above-input pair. Deliberately
  not uppercase like `.meta`: it wraps the input, and `text-transform` inherits.
- **Chips** — `.chip`, `.chip-active`. This is the segmented-control vocabulary
  — reach for it before a pair of buttons whose selected half is `btn-solid`.

## Radius and density

`rounded-control` (pill), `rounded-card`, `rounded-field`. Never `rounded-none`
— the theme is not square, so it fights rather than agrees.

`--spacing` is `0.28rem`, not Tailwind's `0.25rem`, so every `gap-2`/`p-3`
renders 12% larger than its name suggests. Inherited deliberately; see Still
open.

## Rules

These are what stop the system drifting back into a pile of one-off colours.

1. **One solid accent per view.** One `btn-solid` on a screen — the single thing
   the user came to do. Everything else is outline, ghost or quiet. The rule is
   about one _action_, not one element: a long marketing page may repeat its
   single CTA at the top and the foot. Two solid buttons offering _different_
   actions is the violation.
2. **Accent is not a status.** Lime means "the primary action" or "your role
   here". Lifecycle states (live, pending, rejected, draft) use the four status
   hues. Never `badge-accent` for a state.
3. **Mono for labels and numbers, sans for sentences.** If it is scanned —
   heading, label, count, ID, timer, badge — it stays mono. If it is read, it
   gets `.prose` or `font-sans`.
4. **Depth from lightness and hairlines, not shadow.**
   `canvas → surface → raised → overlay` plus a 1px `line`. Shadow is only for
   things that genuinely float: dropdowns, dialogs, the mobile drawer.
5. **Never hand-roll a mode swap.** No `dark:` variant for a colour, no
   light/dark pairs. If a colour must differ by mode it needs a token — that is
   the entire point of the layer. (`dark:` is still fine for non-colour
   properties, e.g. swapping the light/dark logo asset.)
6. **Tabular numerals wherever digits stack.** `.tnum` on counts in a list,
   times in a timeline, any column of numbers. Non-aligning digits are the
   fastest way to make a dashboard look unfinished.

## Adding a component class

Add it to `@layer components` in `hackagon.css`, not as a one-off in a `.svelte`
file — a second usage will otherwise copy the literal values. Colour it from
tokens only, and use `--spacing(n)` rather than hard-coded rem so it tracks the
density scale. Tailwind's `utilities` layer wins over `components`, so a caller
can still override with a utility.

Before adding one, check whether a variant of an existing class does the job:
the set is deliberately small.

## Still open

- **`--spacing` is `0.28rem`.** Moving to Tailwind's `0.25rem` and recovering
  the density through explicit component padding is the right end state, but it
  resizes every screen at once, so it wants its own change with eyes on it.
- **The mono face is an unpinned system stack**, so the app looks slightly
  different per OS. Since mono carries the identity, self-hosting one face would
  fix that; prose can stay on the system sans.
- **List-row titles sit below the scale.** Row headings in `ProjectCard`,
  `TeamCard`, `ParticipantCard` and the submissions and timeline lists are
  `text-sm` at the base heading weight, because the scale's smallest display
  step (`text-section`, 17px) is too large for a dense list. They are the one
  place a heading size does not come from the scale; a fifth step below
  `section` would close it.
