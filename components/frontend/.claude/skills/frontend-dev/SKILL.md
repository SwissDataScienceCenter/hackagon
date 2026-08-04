---
name: frontend-dev
description:
  Building UI in the Hackagon SvelteKit frontend — route-group structure, Svelte
  5 runes, Skeleton v3 + Tailwind styling, reusable components, enum→label
  display helpers and the server-only boundary, and the dev/lint/test/format
  commands. Use when adding a page or component, styling UI, writing display
  helpers, or running/checking the frontend. For calling the backend from a
  load/action, see frontend-backend-wiring.
---

# Frontend development

SvelteKit + **Svelte 5 (runes)**, **Skeleton v3** (Tailwind v4) UI,
`adapter-node`, pnpm + Vite. Dev server runs on **:8081**. This skill is the
client/UI side; for gRPC data loading and error translation see the
**frontend-backend-wiring** skill.

## Route structure (`src/routes`)

Route groups carry the auth boundary:

- `(public)/` — anonymous pages: `/` landing, `/hackathon/[id]` (public
  marketing view; currently a static mock, not yet backend-wired).
- `(app)/` — everything behind Keycloak login: `/dashboard`, `/manage/...`,
  `/hackathons/create`, and the member hackathon subtree
  `/my/hackathon/[id]/{overview,projects,teams,participants,submissions,timeline,pages/[pageId]}`.
- `(participant)/`, plus top-level `signin`, `signout`, `+error.svelte`.

The public `/hackathon/[id]` and member `/my/hackathon/[id]/...` are **disjoint
path spaces** on purpose; a signed-in visitor to the public page is redirected
to the member overview (`(public)/hackathon/[id]/+page.server.ts`).

Each route is `+page.server.ts` (server `load`/`actions`) → `+page.svelte` (UI).
A page reads its loader output as `data`; shared data comes from a layout via
`event.parent()` (see frontend-backend-wiring).

## Svelte 5 runes

Use runes, not the Svelte 4 `export let` / reactive `$:` style:

```svelte
<script lang="ts">
  import type { PageData } from './$types'
  let { data }: { data: PageData } = $props()          // props
  let page = $state(1)                                  // local state
  const pageCount = $derived(Math.ceil(data.projects.length / 8))  // computed
  $effect(() => { if (page > pageCount) page = pageCount })        // side effect
</script>
```

(real: `(app)/my/hackathon/[id]/projects/+page.svelte`)

## Components (`src/lib/components/<area>/`)

Areas: `hackathon/`, `dashboard/`, `layout/`, `forms/`, `profile/`. Prototype
for a list row is `hackathon/HackathonRow.svelte`. Conventions:

- Type props inline in the `$props()` destructure; give optionals defaults.
- Keep display props **generic strings** so a component is reusable — e.g.
  `badge?: string` + `badgePreset = 'preset-tonal-primary'`, not a
  status-specific enum. The caller resolves the label/preset (see helpers
  below).
- Icons: `lucide-svelte`. Internal links: `resolve()` from `$app/paths`
  (`href={resolve(href)}`).
- Size/variant via a `size?: 'default' | 'compact'` prop that switches Tailwind
  classes.

## Display helpers — and the hard server boundary

**Never import from `$lib/server/` (including `generated/` types) in a `.svelte`
file** — `$lib/server` is server-only and will leak/break the client bundle.
Instead, put enum→label/preset lookups in `src/lib/utils/<domain>.ts` keyed by
**raw numbers**, and consume them with a fallback:

```ts
// src/lib/utils/projectStatus.ts  — UNSPECIFIED=0, PROPOSED=1, APPROVED=2
const LABEL: Partial<Record<number, string>> = { 1: "Proposed", 2: "Approved" }
export const projectStatusLabel = (s: number) => LABEL[s]
```

```svelte
<span class="badge {projectStatusBadgePreset(status) ?? 'preset-tonal-surface'}">
  {projectStatusLabel(status) ?? 'Unknown'}
</span>
```

`Partial<Record<number, string>>` (not `Record`) types unknown values as
`string | undefined`, so the `?? 'Unknown'` fallback is enforced. Existing
helpers: `hackathonStatus.ts`, `projectStatus.ts`, `submissionStatus.ts`,
`phase.ts`.

## Styling (Skeleton v3 + Tailwind)

Use Skeleton preset classes (`badge preset-tonal-success`,
`preset-tonal-warning`, `preset-tonal-primary`) and Skeleton surface tokens
(`bg-surface-100-900`, `text-surface-500`) alongside plain Tailwind utilities.
Match the surrounding files' class density and ordering rather than inventing a
new style.

## Mobile first — every screen, every time

**Design for ~375px first, then add breakpoints upward.** Tailwind's unprefixed
utility is the _mobile_ value; `sm:`/`md:`/`lg:` are the enhancements. A layout
that only works at desktop width is not finished. Assume a phone until a
breakpoint says otherwise.

**Page padding.** The house standard, used by every route:

```
px-4 py-8 sm:px-10 md:px-20          <!-- app pages -->
px-4 py-8 sm:px-10 sm:py-12 md:px-20 <!-- marketing sections, more vertical air -->
```

Never a bare `px-20`/`py-12` with no mobile step below it — 80px of side padding
on a 375px screen leaves ~215px of content.

**The four things that actually break on a phone**, all seen in this codebase:

1. **A flex row that never stacks.** `flex` + a fixed-width `shrink-0` child is
   a row at every width. Add the stack: `flex flex-col lg:flex-row`, and give
   the fixed child `w-full lg:w-80`.
2. **A grid with no responsive ladder.** `grid-cols-3` is three columns on a
   phone. Always climb: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
   (`HighlightsSection.svelte` is the reference).
3. **A row of N items with a wide gap.** Six logos at `gap-12` need ~620px.
   Either `flex-wrap` with a smaller mobile gap
   (`flex-wrap gap-x-8 gap-y-6 sm:gap-x-12`) or `overflow-x-auto` for tab/filter
   bars, where wrapping would stop it reading as tabs.
4. **Fractional widths applied at all sizes.** `w-2/3` on a card's text column
   wastes a third of a phone screen. Use `w-full sm:w-2/3`.

**Also:** headings need a scale (`text-3xl sm:text-4xl md:text-5xl`, not a bare
`text-5xl`); wide tables go in `overflow-x-auto` with `min-w-[…]` on the
`<table>`, never on the wrapper; search inputs are `w-full sm:w-72`; and a
carousel's slides-per-view belongs in CSS (`snap-x snap-mandatory` +
`overflow-x-auto`, slide widths per breakpoint) rather than a hardcoded
percentage transform — snap scrolling also gives touch swiping for free.

Good existing references: `PhaseTimeline.svelte` (fixed-width segments that
scroll on mobile, `flex-1` from `sm:`), `HeroSection.svelte` (scaled heading,
`flex-col sm:flex-row` meta row), `AppSidebar.svelte` (off-canvas drawer with
its own mobile header bar).

**Verifying.** There is no browser or screenshot tool in this environment
(`.claude/skills/run-hackagon/` is empty; no Playwright/Puppeteer/Chrome), so
responsive changes cannot be visually confirmed here — say so rather than
implying they were checked. Narrow a real browser to ~375px, or use devtools
device mode. What you _can_ verify mechanically: `pnpm build` succeeds, and
`grep` the built CSS in `.svelte-kit/output/` to confirm a custom class or
breakpoint variant was generated.

## Commands (from `components/frontend/`)

Run inside the Nix dev shell (`direnv allow` / `just dev` at repo root):

- `just serve` → `pnpm dev` on **:8081** (needs `data/test/config/secrets.yaml`;
  `cp data/test/config/secrets.yaml.example …` and fill in on first setup).
- `just lint` → ESLint + `tsc --noEmit`.
- `just test` → Vitest (`@testing-library/svelte`, jsdom).
- `just format` → Prettier.
- `just build` → production build via `adapter-node`.

Note: the `run-hackagon` stack already serves the frontend on :8081 via
process-compose, so `just serve` will clash on the port if the stack is up —
either use the running instance or `just down` first.

## CI checks & formatting (before every commit)

CI (`.github/workflows/ci.yml`) runs on every PR, in order: a generated-code
sync check, **Format check**, lint, build, and test — for both `backend` and
`frontend`. Reproduce the whole thing locally with `just ci::all`.

The **Format check** is `treefmt --fail-on-change`: it reformats the tree and
fails if _anything_ changed — including markdown and these very skill files, not
just `.ts`/`.svelte`. So format before you commit, or CI goes red on files you
didn't think of. treefmt is the authority (it runs Prettier, plus shfmt, stylua,
ruff, nixfmt); `just format` (frontend-only Prettier) is not enough on its own.

Write-mode format (from the repo root), then verify it's clean the way CI does:

```bash
nix run ./tools/nix#treefmt -- <path> [<path> ...]         # writes changes
nix run ./tools/nix#treefmt -- <path> [<path> ...] --ci    # 0 = clean, nonzero = would change
```

Lint/build/test a single component the same way CI does, e.g.
`just check::lint -c frontend`, `just check::test -c frontend`.

## Verify UI changes

Public routes: screenshot with the run skill —
`.claude/skills/run-hackagon/shot.sh /` or `shot.sh /hackathon/<id> out.png` —
then **look at the PNG**. Auth-gated `(app)` pages can't be screenshotted
headlessly (Keycloak redirect); log in interactively as `alice`/`aliceandbob` at
http://localhost:8081, or verify the underlying data with `just rpc::as`. See
the `run-hackagon` skill for the full loop.
