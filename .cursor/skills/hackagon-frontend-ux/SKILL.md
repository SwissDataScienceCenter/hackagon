---
name: hackagon-frontend-ux
description: >-
  Frontend UX for Hackagon: Svelte 5, Tailwind v4, Skeleton, cohesive legible
  dense UI, SvelteKit server-side backend integration, and gRPC/proto contracts.
---

# Agent skills — Hackagon frontend UX

This document guides AI agents and contributors building the **participant-facing experience** in this repository. Treat it as binding context for implementation work.

## Product direction

- Ship an **exceptionally polished UX**: clear hierarchy, predictable interactions, fast feedback, and accessible defaults.
- Aim for a **cohesive** product: one shared visual language (Skeleton theme tokens, repeated patterns, consistent component behavior) so dense screens still feel like one system, not a pile of one-offs.
- Interfaces will often be **crowded** by necessity; optimize for **legibility** first—readable type scale and line length, unambiguous labels, strong alignment and grouping, and contrast that holds up in both themes—then add polish without sacrificing scanability.

## Stack (do not drift without discussion)

| Layer | Choice | Notes |
|--------|--------|--------|
| Framework | **Svelte 5** | Runes (`$state`, `$derived`, `$props`, etc.), Snippets, modern event handling. |
| App shell | **SvelteKit** | File-based routing, server load/actions, `hooks.server.ts`. |
| Styling | **Tailwind CSS v4** | Use the Vite plugin pipeline; utility-first with design tokens from Skeleton. |
| Components & theme | **Skeleton** (`@skeletonlabs/skeleton`, `@skeletonlabs/skeleton-svelte`) | Use primitives and patterns from Skeleton; global theme imports live in `components/frontend/src/app.css` (e.g. Cerberus preset). |
| Icons | **lucide-svelte** | Already in the frontend package; match stroke/size to Skeleton scale. |
| Validation | **Zod** | Shared schemas for config and, where useful, API-shaped data at boundaries. |
| Auth | **Auth.js for SvelteKit** | Session and OIDC flows; see `components/frontend/src/auth.ts` and hooks. |

When adding UI, **reach for Skeleton first** (buttons, inputs, dialogs, layout helpers), then Tailwind for layout and fine tuning, then custom markup only when necessary.

## Workflow: plan, then build

1. **Understand the request** — Which route, which user state (signed in or not), and which server data are involved?
2. **Locate contracts** — Backend RPCs and messages are defined under `api/proto/`. The Go service implements them in `components/backend/`. Read or extend protos before assuming HTTP shapes.
3. **Sketch the data flow** — What runs on the server (`+page.server.ts`, `+layout.server.ts`, `$lib/server/*`) vs the client (`+page.svelte`, islands). Secrets and backend addresses **never** belong in client-only code.
4. **Design the UI structure** — Page regions (header, main, aside), component boundaries, loading and empty states, and error surfaces (Skeleton + existing `+error.svelte` patterns).
5. **Implement in small steps** — Types and loaders first, then markup, then motion/polish. Keep diffs focused.

If a feature touches **auth or backend connectivity**, read the current `hooks.server.ts`, `auth.ts`, and config schema (`components/frontend/src/lib/schemas/config-schema.ts`) before wiring new calls.

## Backend integration (seamless and safe)

- The backend exposes **gRPC** (see `components/backend/cmd/service/main.go`). Services and messages are the source of truth in **`api/proto/**/*.proto`**.
- **Call the backend from SvelteKit server code** (load functions, actions, server-only modules under `$lib/server`). Forward user identity via the same mechanisms the backend expects (e.g. JWT validation middleware on the Go side). Do not expose service credentials or internal host details to the browser.
- When new RPCs are added, **update protos in `api/proto`**, regenerate Go code as per the backend workflow, and add typed client usage in the frontend only where a Node-compatible gRPC client exists in the project; if a gateway or REST layer is introduced later, **still** derive types and validation from the same contract.
- Align naming and field semantics with proto messages (camelCase in TS typically maps from proto JSON/gRPC field conventions; keep transforms explicit in one place).

## Clean design checklist

- **Cohesion under density** — Prefer predictable grids, repeated spacing steps, and the same few heading/body styles so busy layouts stay scannable; when space is tight, clarity beats decoration.
- **Skeleton theme tokens** — Use CSS variables and Skeleton component tokens for color, radius, and shadow before hard-coding hex values.
- **Tailwind discipline** — Prefer composable utilities and `class` patterns consistent with existing files; use the Prettier Tailwind plugin ordering already configured in the frontend.
- **Dark mode** — Respect `data-mode` / Skeleton dark variant patterns already in `app.css`.
- **Accessibility** — Semantic labels, focus order, keyboard support, and sufficient contrast for both themes. Skeleton components help; do not remove implicit a11y for styling shortcuts.
- **States** — Every async view: loading, success, empty, and error. Avoid layout shift; use Skeleton placeholders or subtle skeletons where appropriate.
- **Copy** — Short, human, action-oriented strings; avoid internal jargon in user-visible text.

## Code quality (frontend)

- **TypeScript strictness** — Run `pnpm check` and `pnpm lint` in `components/frontend` after substantive changes.
- **Svelte 5 idioms** — Prefer runes and `$props()` over legacy patterns; keep components small and composable.
- **Colocation** — Route-specific components under `src/lib/components/` with clear names; reuse layout pieces from `src/lib/components/layout/`.
- **Tests** — Add or update Vitest tests for non-trivial logic (e.g. auth callbacks, parsers); mirror existing test layout in `src/`.

## What not to do

- Do not introduce a second component library or ad-hoc CSS framework alongside Skeleton + Tailwind without an explicit decision.
- Do not bypass `locals` + server loaders for sensitive operations.
- Do not duplicate proto field definitions in multiple places without a shared Zod (or generated) type strategy.

## Quick reference paths

| Purpose | Path |
|--------|------|
| Frontend app | `components/frontend/` |
| Global styles & Skeleton theme | `components/frontend/src/app.css` |
| Proto contracts | `api/proto/` |
| Backend service | `components/backend/` |
| Config schema (backend host, OIDC, etc.) | `components/frontend/src/lib/schemas/config-schema.ts` |

---

*Keep this file accurate when the stack or integration strategy changes.*
