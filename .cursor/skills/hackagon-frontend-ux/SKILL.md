---
name: hackagon-frontend-ux
description: >-
  Frontend UX for Hackagon: Svelte 5, Tailwind v4, the app-owned theme layer,
  cohesive legible dense UI, SvelteKit server-side backend integration, and
  gRPC/proto contracts.
---

# Agent skills — Hackagon frontend UX

This document guides AI agents and contributors building the
**participant-facing experience** in this repository. Treat it as binding
context for implementation work.

## Product direction

- Ship an **exceptionally polished UX**: clear hierarchy, predictable
  interactions, fast feedback, and accessible defaults.
- Aim for a **cohesive** product: one shared visual language (the theme tokens
  in `src/themes/hackagon.css`, repeated patterns, consistent component
  behavior) so dense screens still feel like one system, not a pile of one-offs.
- Interfaces will often be **crowded** by necessity; optimize for **legibility**
  first—readable type scale and line length, unambiguous labels, strong
  alignment and grouping, and contrast that holds up in both themes—then add
  polish without sacrificing scanability.

## Stack (do not drift without discussion)

| Layer              | Choice                                | Notes                                                                                                                                                                                              |
| ------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | **Svelte 5**                          | Runes (`$state`, `$derived`, `$props`, etc.), Snippets, modern event handling.                                                                                                                     |
| App shell          | **SvelteKit**                         | File-based routing, server load/actions, `hooks.server.ts`.                                                                                                                                        |
| Styling            | **Tailwind CSS v4**                   | Use the Vite plugin pipeline; utility-first over the theme tokens.                                                                                                                                 |
| Components & theme | **App-owned theme** (no UI framework) | Semantic tokens and the `.btn`/`.badge`/`.card`/`.field`/`.chip` classes live in `components/frontend/src/themes/hackagon.css`, imported from `app.css`; colour mode is `<html data-mode="dark">`. |
| Icons              | **lucide-svelte**                     | Already in the frontend package; match stroke/size to the type scale.                                                                                                                              |
| Validation         | **Zod**                               | Shared schemas for config and, where useful, API-shaped data at boundaries.                                                                                                                        |
| Auth               | **Auth.js for SvelteKit**             | Session and OIDC flows; see `components/frontend/src/auth.ts` and hooks.                                                                                                                           |

When adding UI, **reach for the theme's component classes first** (`.btn`,
`.badge`, `.card`, `.field`, `.chip`), then Tailwind for layout and fine tuning,
then custom markup only when necessary. Add new component classes to
`hackagon.css` rather than inlining a second copy of the same recipe.

## Workflow: plan, then build

1. **Understand the request** — Which route, which user state (signed in or
   not), and which server data are involved?
2. **Locate contracts** — Backend RPCs and messages are defined under
   `api/proto/`. The Go service implements them in `components/backend/`. Read
   or extend protos before assuming HTTP shapes.
3. **Sketch the data flow** — What runs on the server (`+page.server.ts`,
   `+layout.server.ts`, `$lib/server/*`) vs the client (`+page.svelte`,
   islands). Secrets and backend addresses **never** belong in client-only code.
4. **Design the UI structure** — Page regions (header, main, aside), component
   boundaries, loading and empty states, and error surfaces (theme component
   classes + existing `+error.svelte` patterns).
5. **Implement in small steps** — Types and loaders first, then markup, then
   motion/polish. Keep diffs focused.

If a feature touches **auth or backend connectivity**, read the current
`hooks.server.ts`, `auth.ts`, and config schema
(`components/frontend/src/lib/schemas/config-schema.ts`) before wiring new
calls.

## Backend integration (seamless and safe)

- The backend exposes **gRPC** (see `components/backend/cmd/service/main.go`).
  Services and messages are the source of truth in
  **`api/proto/**/\*.proto`\*\*.
- **Call the backend from SvelteKit server code** (load functions, actions,
  server-only modules under `$lib/server`). Forward user identity via the same
  mechanisms the backend expects (e.g. JWT validation middleware on the Go
  side). Do not expose service credentials or internal host details to the
  browser.
- When new RPCs are added, **update protos in `api/proto`**, regenerate Go code
  as per the backend workflow, and add typed client usage in the frontend only
  where a Node-compatible gRPC client exists in the project; if a gateway or
  REST layer is introduced later, **still** derive types and validation from the
  same contract.
- Align naming and field semantics with proto messages (camelCase in TS
  typically maps from proto JSON/gRPC field conventions; keep transforms
  explicit in one place).

## Spacing & typography scale

- **Page gutter** — `px-4 sm:px-10 md:px-20` for nav, footer, marketing
  sections, dashboard, and hackathon content; list routes use `py-8` on the main
  shell.
- **Section vertical** — `py-12` for most content bands; hero blocks use
  `pt-8 pb-12` (and `min-h-96` / `min-h-[30rem]` where a min height is
  required).
- **Dense list cards** (proposals, teams, participants) — `py-4 px-5`, `gap-4`
  between media and text; title `text-sm font-semibold` (or `font-bold` for team
  names), body `text-xs`, `leading-snug` / `leading-normal`; card CTAs `h-9`
  with `w-24` / `min-w-40` as needed. Avoid one-off `text-[Npx]` /
  `p-[16px_20px]`; use the Tailwind scale and `max-w-*` for measure.
- **Prose** — Prefer `text-base` / `text-sm` with `leading-relaxed` for
  paragraphs; headings `text-xl`–`text-2xl` for section titles on marketing
  pages.

## Clean design checklist

- **No section-divider borders** — Do not use `border-t` / `border-b` between
  page sections. Rely on alternating background colors (`bg-raised` vs
  `bg-canvas`) and spacing to separate sections visually. Borders inside
  cards/components (e.g. card headers, list dividers) are fine.
- **Cohesion under density** — Prefer predictable grids, repeated spacing steps,
  and the same few heading/body styles so busy layouts stay scannable; when
  space is tight, clarity beats decoration.
- **Theme tokens** — Use the semantic tokens (`bg-surface`, `text-ink-3`,
  `text-accent-ink`, `border-line`) for colour and radius. Never hard-code a hex
  or an `oklch()` value in a component.
- **Tailwind discipline** — Prefer composable utilities and `class` patterns
  consistent with existing files; use the Prettier Tailwind plugin ordering
  already configured in the frontend.
- **Dark mode** — Respect `data-mode` and `color-scheme` sync in `app.html` /
  `LightSwitch.svelte`. Every colour token already flips with the mode, so never
  hand-roll the swap: no `dark:` variant for a colour and no light/dark pairs.
  If a colour must differ by mode, it needs a token.
- **Accessibility** — Semantic labels, focus order, keyboard support, and
  sufficient contrast in both colour modes. Do not remove implicit a11y for
  styling shortcuts.
- **States** — Every async view: loading, success, empty, and error. Avoid
  layout shift; reserve the space a pending result will occupy.
- **Copy** — Short, human, action-oriented strings; avoid internal jargon in
  user-visible text.

## Code quality (frontend)

- **TypeScript strictness** — Run `pnpm check` and `pnpm lint` in
  `components/frontend` after substantive changes.
- **Svelte 5 idioms** — Prefer runes and `$props()` over legacy patterns; keep
  components small and composable. **Do not use `<svelte:component>`**
  (deprecated in runes mode); pick the component in script or with
  `{@const Icon = ...}` and render **`<Icon />`** (see `EventsSection.svelte` /
  `HackathonSidebar.svelte`).
- **Colocation** — Route-specific components under `src/lib/components/` with
  clear names; reuse layout pieces from `src/lib/components/layout/`.
- **Tests** — Add or update Vitest tests for non-trivial logic (e.g. auth
  callbacks, parsers); mirror existing test layout in `src/`.

## What not to do

- Do not introduce a component library or ad-hoc CSS framework alongside the
  theme layer + Tailwind without an explicit decision. The app deliberately owns
  its theme — Skeleton was removed for that reason.
- Do not bypass `locals` + server loaders for sensitive operations.
- Do not duplicate proto field definitions in multiple places without a shared
  Zod (or generated) type strategy.

## Quick reference paths

| Purpose                                  | Path                                                   |
| ---------------------------------------- | ------------------------------------------------------ |
| Frontend app                             | `components/frontend/`                                 |
| Global styles                            | `components/frontend/src/app.css`                      |
| Theme tokens & component classes         | `components/frontend/src/themes/hackagon.css`          |
| Proto contracts                          | `api/proto/`                                           |
| Backend service                          | `components/backend/`                                  |
| Config schema (backend host, OIDC, etc.) | `components/frontend/src/lib/schemas/config-schema.ts` |

---

_Keep this file accurate when the stack or integration strategy changes._
