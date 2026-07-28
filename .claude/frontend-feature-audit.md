# Frontend feature audit — what's real vs. mocked vs. invented

Branch: `feat/frontend-add-admin-section` · Date: 2026-07-28

Purpose: discussion doc for the team. For every non-trivial frontend feature,
this records whether it's backed by a real gRPC call, backed by a proto/DB
contract that just isn't wired up (or has no handler yet), or has no backend
representation at all.

## Group A — backend fully exists, just needs wiring in the frontend

| Feature | Frontend location | Proto | DB | Runtime | Notes |
|---|---|---|---|---|---|
| Dashboard "Join" button | `DashboardView.svelte:54-56,129-134` | `HackathonService.Join` | `Participant` | live | Currently `alert('Join: not yet implemented')` — pure wiring task. |
| Admin role gate | `(admin)/+layout.server.ts` | `GlobalRole`, `AddRole`/`RemoveRole` | `User` | live | `/users` list works but nothing checks the caller's role before serving it. |
| `isAdmin` on hackathon sidebar | `overview/+page.svelte:80` | `GlobalRole` | `User` | live | Hardcoded `false`; should derive from `platformUser` roles. |
| Waitlist badge | `hackathonStatus.ts` | `Participant.is_waiting` | yes | live | Already correct end-to-end — confirmed real, not noise. |

## Group B — proto + DB exist, but no Go handler registered yet

| Feature | Frontend location | Proto | DB | Runtime | Notes |
|---|---|---|---|---|---|
| Proposals tab | `proposals/+page.svelte` (99 ln) | `ProjectService` | `Project` | unregistered | Hardcoded 16-item array, dead `#propose` anchor. Blocked on backend handler (already on priority list). |
| Overview proposal preview | `overview/+page.svelte:38-68` | `ProjectService` | `Project` | unregistered | Fabricated counts ("16 proposals"). Same dependency as above. |
| Teams tab | `teams/+page.svelte` (222 ln) | `TeamService` | `Team`+`TeamParticipant` | unregistered | Hardcoded 9-team array, dead `#create-team` anchor. |
| Participants tab | `participants/+page.svelte` (103 ln) | `HackathonMember` via `HackathonService.Get` | `Participant` | **already live** | Real member data is already available via the layout — this page ignores it and renders a fully hardcoded demo array. Could be wired up today, zero backend work needed. |
| Timeline tab | `timeline/+page.svelte` (5 ln stub) | `Phase` conceptually | `Phase` | unregistered (`PhaseService`) | The layout above it already renders a real `PhaseTimeline` from live data — question: does this dedicated tab need to exist separately? |
| Submissions tab | `submissions/+page.svelte` (5 ln stub) | `Submission` entity exists, no `SubmissionService` proto | `Submission` | n/a | Half-modeled: table + entity exist, service contract not written yet (scoped under TeamService in the priority list, not done). |

## Group C — zero backend representation at any layer

| Feature | Frontend location | Notes |
|---|---|---|
| Webinars tab | `webinars/+page.svelte` (5 ln stub) | No concept anywhere. Kill the tab or scope a real feature? |
| Photos tab | `photos/+page.svelte` (5 ln stub) | Same. `PageService` (CMS-ish) could theoretically host a gallery, but nothing models "photo" today. |
| Dashboard notifications sidebar | `DashboardView.svelte:145-173` | Two hardcoded cards. See deep-dive below. |
| "Challenges" nav item | `NavBar.svelte:44-49`, marketing page | Links to `/` (dead self-link). No `Challenge` entity. |
| "About" nav item | `NavBar.svelte` | Links to `/` (dead self-link). No about route/content model. |
| Vote & leaderboard marketing card | `routes/+page.svelte:236` | Matches CLAUDE.md's note: `VoteService` explicitly deferred — no `Vote`/`VoteCategory` DB tables. |
| "Win prizes" copy | `hackathon/[slug]/+page.svelte:90` | Static testimonial copy, no prize/judging model anywhere. |
| Sponsors / FAQ / mentor / judge / schedule / announcement | grepped, zero hits | Not even stubbed — flagging in case coworkers expect these to exist. |

## Broken links (separate from the above — just bugs)

- `HackathonSidebar.svelte:43-46` links to `/hackathon/create` and `/admin` —
  **neither route exists**. Real admin content lives at `/users` (inside the
  `(admin)` route group, which does not prefix URLs with `/admin`).

---

## Deep dive: where would notifications come from?

The two mocked cards in `DashboardView.svelte:145-173` are actually two
different *kinds* of notification, and they'd need different implementations:

**1. "Project proposals due in 5 days"** — a deadline reminder.

This is derivable from data that already exists: `Phase.ends_at`. It doesn't
need a stored notification record at all — it could be computed at read time
("any phase ending within N days, for hackathons the caller participates
in"), the same way `HackathonStatus` is already computed server-side instead
of persisted (per CLAUDE.md's read-path conventions). No new schema, no new
service. Downside: it can't be dismissed/marked-read — it just reappears
every load until the deadline passes. That may be fine for a reminder.

**2. "You were added to Team DataFlow"** — an activity/event notification.

This one is fundamentally different: it's tied to a specific moment
(`TeamService.AssignUser` being called), and there is no way to reconstruct
"this happened" after the fact from current state alone — current state only
shows "you're on team DataFlow now," not "you were just added." That requires
persisting the event when it happens.

Nothing in the current proto or DB schema models this — no `Notification`
entity, no event/audit log table to derive it from. Building it means:

- A new DB table (`notification`: id, user_id, hackathon_id?, type, payload,
  created_at, read_at) + matching proto entity, and a `NotificationService`
  (`List`, `MarkRead` at minimum).
- Some mechanism for mutation handlers to actually create these rows. Two
  options, worth a team discussion:
  - **Inline, at the call site** — `AssignUser`, `ApproveParticipant`,
    `Project.Approve/Reject`, `AddRole`, phase-created, etc. each call a
    small `notify(...)` helper directly after their write. Simple, consistent
    with "boring, proven solutions" — but it's N call sites to remember, and
    it's easy to add a new mutation later and forget the notification.
  - **Event-driven** — handlers emit a domain event, a single subscriber
    turns events into notification rows. Cleaner separation, but introduces
    event-bus/outbox infrastructure that doesn't exist anywhere else in this
    codebase yet — likely overkill for the current scale.

Given the project's existing size and the "prefer boring, proven solutions"
principle, the inline approach is probably the pragmatic starting point, but
this is a genuine design decision (not just missing wiring) and should be
scoped as its own small RFC before anyone starts implementing — it touches
every future write-path handler, not just one service.
