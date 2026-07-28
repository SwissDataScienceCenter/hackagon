# Handoff: Hackagon frontend wiring

**Repo:** `/Users/smaennel/WORK/HACKATHON/hackagon`
**Branch:** `feat/frontend`
**Date:** 2026-07-28

## Orientation — read these first, don't re-derive them

- `CLAUDE.md` (repo root) — project conventions. Just edited to add a
  **"Frontend exception"** to the Working style section: for
  `components/frontend/` work, the user drives in small, single-focused
  steps and writes/makes their own commits — don't propose commit messages
  or batch multiple asks together there. This applies to this whole session
  of work and should keep applying going forward.
- `.claude/front-status.md` — the live, authoritative inventory of which
  frontend routes are wired to real gRPC calls vs. still hardcoded, plus
  standing notes (no pagination anywhere in the API, frontend-only gates
  aren't real security) and a recommended next quick win. **Read this before
  doing anything** — it's kept up to date every session and this handoff
  intentionally doesn't repeat its contents.
- `.claude/frontend-feature-audit.md` — product/scope questions only
  (features with zero backend representation: webinars, photos, About nav,
  vote/leaderboard, sponsors/FAQ/etc, plus a notifications design deep-dive).
  Trimmed this session to stop duplicating `front-status.md`.
- `.claude/skills/frontend-data-wiring/SKILL.md` — the wiring pattern to
  follow: own `+page.server.ts` per route, reuse parent layout data via
  `event.parent()` instead of refetching, shape data server-side not in the
  component, and keep participant-facing hackathon pages free of any
  viewer-role distinction (admin concerns belong in `/(admin)/*`).

## What happened this session (chronological summary, not a full diff — see `git log`)

Started from a request to audit which frontend routes were real vs. mocked,
then iteratively wired routes one at a time per the user's explicit
direction each turn:

1. Wrote the initial audit (`front-status.md`, `frontend-feature-audit.md`).
2. Removed the "Challenges" nav item and the Dashboard notifications sidebar
   (both had zero backend backing).
3. Wired `participants` (own `+page.server.ts`, reuses layout's
   `hackathon.get()` via `event.parent()`).
4. Discovered via a rebase that `PageService`/`PhaseService` are now live at
   runtime, `HackathonService` gained `Join`/`ApproveParticipant`/`RemoveParticipant`,
   and `TrackService` is fully implemented too — only `ProjectService` and
   `TeamService` remain unregistered. Added `page`+`phase` clients to
   `AuthorizedGrpc` in `client.ts`.
5. Discovered `HackathonService.Get` already eager-loads `Tracks`/`Projects`/
   `Pages`/`Phases`, not just `Members` — this made `proposals` and
   overview's track chips wireable without any backend work. Wired both.
6. Added client-side pagination to `participants` (matching `teams`/`proposals`).
7. Explored an admin-only "view participant contact details" page, then
   **reverted it** per the user's explicit new guideline: keep
   `participants` free of role distinctions; admin/user management belongs
   in `/(admin)/*` instead. `ParticipantCard`'s "View" button was removed
   entirely (not just hidden — no prop, no markup).
8. Built a first-draft redesign of `/(admin)/users` from a screenshot the
   user provided (SDSC-branded top bar + admin subnav + "Users
   Administrator Panel" heading + search + table). New `AdminSubNav`
   component. Only `Photo`/`Display Name`/`Email` are real; `SurName`,
   `Name`, `Status`, `Employer's Category`, `Employer` render `—` because the
   `User` backend model has no such fields — flagged, not fabricated.
9. Consolidated: merged the frontend-specific commit-workflow preference
   (previously only in my private cross-session memory) into `CLAUDE.md`
   itself so it's shared/durable in the repo; deleted three now-superseded
   private memory files (`project_overview.md`,
   `hackathon_get_notes.md`, `feedback_hackagon_frontend_workflow.md`) and
   trimmed the two `.claude/` docs to remove duplication between them.

## Current git state

Uncommitted right now (the consolidation from step 9): `CLAUDE.md`,
`.claude/front-status.md`, `.claude/frontend-feature-audit.md`. Per the
frontend workflow exception, these are left for the user to review and
commit themselves — don't commit on their behalf.

## Suggested next step

`front-status.md`'s "Recommended next quick win" section has the current
answer — check there rather than assuming it's still the Join button by the
time this is picked up, since it gets updated as work lands.

## Skills likely useful next session

- `frontend-data-wiring` (project skill) — load it before wiring any new
  route; it's the established pattern for this codebase.
- No other specialized skill is needed for continuing this work — it's
  direct, incremental SvelteKit/gRPC wiring following the pattern above.
