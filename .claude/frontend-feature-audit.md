# Frontend feature audit — product/scope questions

Branch: `feat/frontend` · Date: 2026-07-28

Purpose: discussion doc for the team, scoped to product/scope questions —
"do we even want this, and where would the data come from." For per-route
technical wiring status (what's real vs. mocked right now), see
[[front-status.md]] instead — this doc no longer repeats that inventory to
avoid the two drifting apart.

## Resolved since this audit was first written

- "Challenges" nav item (dead self-link) — removed from `NavBar.svelte`.
- Dashboard notifications sidebar (two hardcoded cards) — removed from
  `DashboardView.svelte` entirely, not just left mocked. The "where would
  notifications come from" analysis below is kept as forward-looking design
  reference in case the feature is reintroduced later — it no longer
  describes anything currently in the UI.
- Participants tab, Dashboard "Join" button, proposals/overview preview,
  track chips — all wired since; see `front-status.md`.

## Group C — zero backend representation at any layer (still open)

| Feature | Frontend location | Notes |
|---|---|---|
| Webinars tab | `webinars/+page.svelte` (5 ln stub) | No concept anywhere. Kill the tab or scope a real feature? |
| Photos tab | `photos/+page.svelte` (5 ln stub) | Same. `PageService` (CMS-ish) could theoretically host a gallery, but nothing models "photo" today. |
| "About" nav item | `NavBar.svelte` | Links to `/` (dead self-link). No about route/content model. |
| Vote & leaderboard marketing card | `routes/+page.svelte:236` | Matches CLAUDE.md's note: `VoteService` explicitly deferred — no `Vote`/`VoteCategory` DB tables. |
| "Win prizes" copy | `hackathon/[slug]/+page.svelte:90` | Static testimonial copy, no prize/judging model anywhere. |
| Sponsors / FAQ / mentor / judge / schedule / announcement | grepped, zero hits | Not even stubbed — flagging in case coworkers expect these to exist. |

## Deep dive: where would notifications come from? (design reference, feature currently removed)

Two different *kinds* of notification would need different implementations:

**1. "Project proposals due in 5 days"** — a deadline reminder.

Derivable from data that already exists: `Phase.ends_at`. Doesn't need a
stored notification record — could be computed at read time ("any phase
ending within N days, for hackathons the caller participates in"), the same
way `HackathonStatus` is computed server-side instead of persisted. No new
schema, no new service. Downside: can't be dismissed/marked-read — reappears
every load until the deadline passes.

**2. "You were added to Team DataFlow"** — an activity/event notification.

Fundamentally different: tied to a specific moment (`TeamService.AssignUser`
being called), and there's no way to reconstruct "this happened" after the
fact from current state alone. Requires persisting the event when it happens:

- A new DB table (`notification`: id, user_id, hackathon_id?, type, payload,
  created_at, read_at) + matching proto entity, and a `NotificationService`
  (`List`, `MarkRead` at minimum).
- Some mechanism for mutation handlers to create these rows — worth a team
  discussion between two shapes:
  - **Inline, at the call site** — each relevant handler (`AssignUser`,
    `ApproveParticipant`, project approve/reject, `AddRole`, phase-created,
    etc.) calls a small `notify(...)` helper after its write. Simple,
    consistent with "boring, proven solutions" — but N call sites to
    remember, easy to forget on a new mutation.
  - **Event-driven** — handlers emit a domain event, a single subscriber
    turns events into notification rows. Cleaner separation, but introduces
    event-bus/outbox infrastructure this codebase doesn't have anywhere else
    — likely overkill at current scale.

Given the project's size and "prefer boring, proven solutions," the inline
approach is probably the pragmatic starting point — but this is a genuine
design decision, not just missing wiring, and should be scoped as its own
small RFC before implementation, since it touches every future write-path
handler.
