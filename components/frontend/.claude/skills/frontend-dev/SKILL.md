---
name: frontend-dev
description:
  Building UI in the Hackagon SvelteKit frontend — route-group structure, Svelte
  5 runes, reusable components, enum→label display helpers and the server-only
  boundary, and the dev/lint/test/format commands. Use when adding a page or
  component, writing display helpers, or running/checking the frontend. For the
  visual system (colour tokens, type roles, component classes) see
  frontend-theme; for calling the backend from a load/action, see
  frontend-backend-wiring.
---

# Frontend development

SvelteKit + **Svelte 5 (runes)**, **Tailwind v4** with the app's own theme
layer, `adapter-node`, pnpm + Vite. Dev server runs on **:8081**. This skill is
the client/UI side; for the visual system see the **frontend-theme** skill, and
for gRPC data loading and error translation see **frontend-backend-wiring**.

## Route structure (`src/routes`)

Route groups carry the auth boundary:

- `(public)/` — anonymous pages: `/` landing, `/hackathon/[id]` (public
  marketing view; currently a static mock, not yet backend-wired).
- `(app)/` — everything behind Keycloak login: `/dashboard`, `/manage/...`,
  `/hackathons/create`, and the member hackathon subtree
  `/my/hackathon/[id]/{overview,projects,teams,participants,submissions,timeline,pages/[pageId]}`.
- Top-level `signin`, `signout`, `+error.svelte`. There is no other route group.

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

Areas: `hackathon/`, `dashboard/`, `layout/`, `forms/`. Prototype for a list row
is `hackathon/HackathonRow.svelte`. Conventions:

- Type props inline in the `$props()` destructure; give optionals defaults.
- Keep display props **generic strings** so a component is reusable — e.g.
  `badge?: string` + `badgeVariant = 'badge-accent'`, not a status-specific
  enum. The caller resolves the label/variant (see helpers below).
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
<span class="badge {projectStatusBadgeVariant(status) ?? 'badge-neutral'}">
  {projectStatusLabel(status) ?? 'Unknown'}
</span>
```

`Partial<Record<number, string>>` (not `Record`) types unknown values as
`string | undefined`, so the `?? 'Unknown'` fallback is enforced. Existing
helpers: `hackathonStatus.ts`, `projectStatus.ts`, `submissionStatus.ts`,
`phase.ts`.

## Styling

The app owns its theme — no UI framework underneath. Semantic colour tokens
(`bg-surface`, `text-ink-3`, `text-accent-ink`), a mono/sans type split, and a
small component set (`.btn`, `.badge`, `.card`, `.field`, `.chip`) live in
`src/themes/hackagon.css`, alongside plain Tailwind utilities.

**Load the frontend-theme skill before styling anything** — it carries the token
vocabulary, the component variants, and the rules that keep them coherent (one
solid accent per view, accent is never a status, no hand-rolled dark-mode
swaps). Match the surrounding files' class density and ordering rather than
inventing a new style.

## Commands (from `components/frontend/`)

Run inside the Nix dev shell (`direnv allow` / `just dev` at repo root):

- `just serve` → `pnpm dev` on **:8081** (needs `data/test/config/secrets.yaml`;
  `cp data/test/config/secrets.yaml.example …` and fill in on first setup).
- `just lint` → ESLint + `tsc --noEmit`.
- `just test` → Vitest (`@testing-library/svelte`, jsdom).
- `just format` → Prettier.
- `just build` → production build via `adapter-node`.

Note: `just start` (repo root) already serves the frontend on :8081 via
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

**Run the pre-commit gate as one call.** Format, lint and test as three separate
tool calls cost three full context re-reads for no extra information — and this
is the chain you run most often. Chain it and read one output:

```bash
nix run ./tools/nix#treefmt -- <paths> && \
  just check::lint -c frontend && just check::test -c frontend
```

`&&` short-circuits, so the first failure is what you see — which is what you
wanted anyway. Same for inspecting your work before a commit: one
`git status --short && git diff --stat && git diff` beats three calls.

## Verify UI changes

Bring the stack up with `just start` from the repo root, then open
http://localhost:8081.

Auth-gated `(app)` pages need a real session before they render anything —
Keycloak redirects an anonymous request away — and nothing in this repo captures
one today. That is a missing setup, not an impossibility: Playwright can drive
the Keycloak form (username → Sign In → password) and reuse the session, which
is how the `sketch/experimental-frontend-deployment` branch screenshots every
member tab at desktop and phone widths — see
`.claude/skills/hackathon-e2e/helpers/login.ts` **on that branch** if you decide
to port it (its realm config differs from main's, so the flow needs re-verifying
here). Until then, either log in interactively as `alice`/`aliceandbob`, or
verify the underlying data with `just rpc::as alice aliceandbob <svc>/<method>`.

Public routes (`/`, `/hackathon/[id]`) render without a session and can be
captured with whatever headless tool you have; if you take a screenshot, **look
at the PNG** rather than assuming it rendered.

**Screenshots are the single most expensive thing you can put in a session.** A
full-page retina capture is ~500KB, and once read it is re-billed on every
subsequent call for the rest of the session — which routinely makes captures the
largest single consumer of a UI session's budget. So:

- **Downscale before reading.** Never `Read` a raw capture. Resize to ≤1000px
  wide first; UI regressions are still perfectly visible.
  ```bash
  sips -Z 1000 shot.png --out small.png   # macOS, no extra deps
  ```
- **One capture, not a set.** A single representative viewport answers "did this
  render". Don't take top/full/mobile variants unless the change is specifically
  responsive — that was three reads of the same page in one past session.
- **Don't re-screenshot after every tweak.** Make the full round of edits, then
  capture once. Each re-read adds another permanent copy to the window.
- **Crop instead of full-page** when you're checking one component: capture the
  viewport, not `fullPage: true`.
- Write captures to the session scratch dir, not the repo.

If a mutation comes back `PERMISSION_DENIED`, it is very likely capability
configuration rather than your UI — see the frontend-backend-wiring skill.
