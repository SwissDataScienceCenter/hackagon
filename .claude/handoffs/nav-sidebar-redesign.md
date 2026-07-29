# Handoff: hackagon-admin → nav/app-shell redesign

**Repo:** `/Users/smaennel/WORK/HACKATHON/hackagon`
**Branch:** `feat/frontend`
**Date:** 2026-07-29

## Orientation — read these first, don't re-derive them

- `CLAUDE.md` (repo root) — project conventions, including the **"Frontend
  exception"** (for `components/frontend/` work, the user drives in small,
  single-focused steps and commits their own work — don't propose commit
  messages or batch asks there) and the general working style for
  everything else (explain + wait for confirmation before editing,
  especially backend Go files).
- `.claude/front-status.md` — the route-by-route real-vs-fake inventory.
  **It is now stale as of this session** — it predates the teams work,
  timeline, markdown editor, and the overview-page real-data wiring done
  below. Trust `git log` (see below) over its "Recent changes" section for
  anything after 2026-07-28. Refreshing it would be a reasonable small
  first task, but isn't blocking.
- `.claude/handoffs/frontend-wiring-progress.md` — the previous handoff.
  Still accurate for its own "orientation" pointers; superseded by this one
  for "what happened."
- `.claude/skills/frontend-data-wiring/SKILL.md` — the established wiring
  pattern (own `+page.server.ts`, reuse parent data via `event.parent()`,
  shape server-side, keep participant pages free of viewer-role
  distinctions — admin concerns live in `/(app)/(admin)/*`).
- **Standing caveat, proven true repeatedly this session:** `CLAUDE.md`'s
  "Runtime status" section and prior docs have understated what's actually
  registered/implemented more than once (`ProjectService`, `TeamService`,
  and all of `TeamService`'s handlers were already fully live when
  discovered mid-session, contradicting the docs). Before assuming a
  backend service isn't ready, check `components/backend/internal/service/server.go`
  directly, or run `grpcurl -plaintext localhost:3000 list` (needs the Nix
  shell — `just develop` — since `grpcurl`/`buf`/`psql` aren't on PATH
  outside it).

## What happened this session (chronological, not a full diff — see `git log`)

Broad arc: wired the participant "entry" experience end to end (dashboard →
role-based routing → per-hackathon pages), then filled in the remaining
participant-facing routes with real data, discovering and fixing a live
backend bug along the way.

1. **Dashboard entry + admin shell.** Dashboard rows now branch on the
   viewer's real per-hackathon role: Owner gets "Enter as Admin" (→ new
   `(app)/(owner)/owner/hackathon/[slug]` route tree, gated to Owner/global-Admin)
   + "Enter as Participant"; Member gets "Enter"; waitlisted gets neither. A
   "Site Admin" button (global-Admin only) links to `/(app)/(admin)/users`.
   `(app)/(owner)/owner/hackathon/[slug]` grew a real "Pending participants"
   list with Approve/Remove form actions.
2. **Dashboard "Join" wired** — real form action calling
   `HackathonService.Join`, replacing an `alert()` stub.
3. **`/(app)/(admin)/users` 403 crash fixed** — its `load` had no error handling
   around a call that requires global-Admin casbin permission; any other
   logged-in user hit an unhandled crash instead of a clean 403.
4. **Discovered `ProjectService` is fully registered and implemented**
   (contradicting stale docs) — wired proposal creation
   (`.../proposals/create`, moved off the list page per explicit request),
   a proposal detail page (`.../proposals/[projectId]`), and a reusable
   **Markdown editor** (`$lib/components/forms/MarkdownEditor.svelte` +
   `MarkdownContent.svelte`, using `marked` + `isomorphic-dompurify` for
   sanitized rendering) — used for the proposal description field and
   reusable for any future text-content field (e.g. Pages).
5. **Timeline wired** — `.../timeline` reuses the layout's `PhaseTimeline`
   bar (now clickable via a new `onSelect`/`selectedId` prop) instead of a
   separate vertical card list, so it visually matches the overview hero
   exactly. Extracted the completed/active/upcoming status logic into
   `$lib/utils/phase.ts` to stop duplicating it between the layout and this
   page.
6. **Overview page decluttered** — removed the entirely-mocked
   `HackathonSidebar` (dead component, deleted — no other usages), which
   also incidentally fixed 7 pre-existing type errors and 2 a11y warnings
   that were baked into it. Proposals card trimmed to a count + link
   instead of duplicating the Proposals tab's content.
7. **Discovered `TeamService` is fully registered** with a complete handler
   set (`List/Get/Create/Edit/Delete/AssignUser/RemoveUser/CreateSubmission/FinalizeSubmission`) —
   another stale-docs surprise. Key data-model fact: **a `Team` belongs to
   a `Project`, not directly to a `Hackathon`** (`CreateRequest` takes
   `project_id`, no `hackathon_id`), and **only hackathon Owners can create
   teams** (casbin: `Team.Create` has exactly one grant, `Owner`) — Members
   can only be listed/assigned into existing teams. Wired the
   participant-facing `.../teams` list (real `TeamService.List`, dropped
   the "Create Team" button — that's an Owner-only action, belongs in the
   admin shell per the same guideline as participants/proposals) and a new
   `.../teams/[teamId]` detail page (`TeamService.Get`).
8. **Found and fixed a live backend crash**: `TeamService.Get` panicked
   (nil pointer) on any team with submissions, because
   `.WithSubmissions()` didn't eager-load each submission's own
   `Team`/`Project`/`Creator` edges, which `submissionEntryFromEnt`
   dereferences unconditionally. An unrecovered panic in a gRPC handler
   kills the *entire* backend process, not just that request — reproduced
   this live via direct `grpcurl` calls (confirmed the PID changed
   mid-session, `process-compose` auto-restarted). Fixed by nesting the
   loader. Also added `.WithMembers()` to `TeamService.List` (was always
   returning an empty member array) — needed for both real member avatars
   on the teams list and for step 9 below. Rebuilt the binary in place and
   restarted the backend to verify the fix live (see "Runtime environment
   notes" below for how).
9. **Overview `ParticipationCard` replaced with real data** — was 100%
   hardcoded (team "Bishorn", fake deadline, fake "Set Preferences" CTA).
   New `overview/+page.server.ts` calls `team.list()`, finds the team
   containing the current user, cross-references `hackathon.projects`/
   `hackathon.tracks` (already loaded by the parent layout, no extra
   call). Two fields had **no real backend equivalent at all** and were
   dropped rather than relabeled: per-team "role" (no such concept exists;
   only hackathon-level Owner/Member does) and the fabricated deadline.
   Added an honest empty state for users not yet on a team.
10. **Removed the "About" (hackathon description) card from overview** per
    explicit request — that content now lives only on the public
    `/hackathon/[slug]` marketing page, which already has its own copy.

## Current git state

Clean working tree, everything above is committed (the user commits their
own frontend work per the standing convention — see `git log` for exact
commit boundaries, newest first starting at `31254c7672`).

## Runtime environment notes (useful if the backend acts up again)

- Backend runs via `process-compose` (`just start` / `just deploy::up`),
  listening on `localhost:3000`. The actual binary is
  `components/backend/.output/build/bin/service` (not the top-level
  `.output/backend/...` — that's a different, unrelated build path).
- To rebuild+restart after a backend source change without disrupting the
  rest of the stack: `cd components/backend && GOWORK=off go build -o
  .output/build/bin/service ./cmd/service`, then `kill` the PID holding
  port 3000 (`lsof -tiTCP:3000 -sTCP:LISTEN`) — `process-compose` auto
  restarts it with the fresh binary within a few seconds.
- `grpcurl`, `buf`, `psql` all live under `/nix/store/...` even outside an
  active Nix shell — findable via `find /nix/store -maxdepth 1 -iname
  "*<tool>*"` if `just develop` isn't convenient to enter. `just db::psql`
  / `just rpc::as` wrap these but require the Nix shell on PATH.
- Dev users: `hackagon-admin`/`alice`/`bob`/`charles`, password
  `aliceandbob` for all (per `CLAUDE.md`). Alice owns at least one seeded
  hackathon and is on two seeded teams — useful for testing owner-only
  flows without touching Keycloak.

## Suggested next step — the reason for this handoff

The user wants to discuss/design a **navigation restructure**: currently
the root `+layout.svelte` renders a global `NavBar` + `AppFooter` on every
page, and there's no way to switch between hackathons except backing out to
`/dashboard`. Direction floated in this session (not yet started, no code
written): drop the header/footer chrome on *authenticated app* pages in
favor of a collapsible left sidebar (hamburger-toggleable) that would also
house a hackathon switcher, replacing the current three separate nav
systems (`NavBar`, `HackathonSubNav`'s horizontal tab strip, and eventually
`AdminSubNav`) with one. Suggested framing to start from: split into two
shells — a public/marketing shell (keep current header+footer) for `/`,
the public `/hackathon/[slug]` page, and signin/signout; and a new
authenticated app shell for everything under `(member)`/`(admin)` (both nested under `(app)`).
This is a structural change touching the root layout and every nested
layout — treat it as its own design pass (alternatives, rough component
boundaries, mobile behavior) before writing code, per the general working
style for non-trivial changes.

## Skills likely useful next session

- `frontend-data-wiring` (project skill) — not directly about nav, but
  still the reference for any data-loading pattern touched incidentally.
- No nav-specific skill exists yet; this is greenfield design work for this
  repo.
