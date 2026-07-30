# Frontend feature audit — product/scope questions

Branch: `feat/frontend` · First written 2026-07-28 · Reconciled 2026-07-30

Purpose: a discussion doc for the team, scoped to product/scope questions — "do
we even want this, and where would the data come from." For per-route technical
wiring status (what's real vs. mocked), see [[front-status.md]] instead; this doc
doesn't repeat that inventory, so the two can't drift.

## Open — UI exists with zero backend representation at any layer

| Feature | Frontend location | Notes |
|---|---|---|
| "About" nav item | `NavBar.svelte` | Links to `resolve('/')` — a dead self-link. No about route or content model. |
| Vote & leaderboard marketing card | `(marketing)/+page.svelte` | `VoteService` deferred — no `Vote`/`VoteCategory` DB tables exist. |
| "Win prizes" copy | `(marketing)/hackathon/[slug]/+page.svelte` | Static copy; no prize/judging model anywhere. That whole page is hardcoded — see `front-status.md`. |
| Sponsors / FAQ / mentor / judge / schedule / announcement | grepped, zero hits | Not stubbed at all — listed in case coworkers expect them to exist. |

## Decisions worth not relitigating

- **Webinars and Photos tabs: killed, not scoped.** Both were 5-line stubs with
  no backend concept; deleted 2026-07-29. `PageService` is a title+text content
  model, so the photo-gallery idea never had a data model behind it.
- **Dashboard notifications: removed.** Was two hardcoded cards. Reintroducing it
  is a real design task, not missing wiring — deadline reminders ("proposals due
  in 5 days") are derivable at read time from `Phase.ends_at`, but activity
  notifications ("you were added to Team X") can't be reconstructed from current
  state and would need a `notification` table, a service, and a decision about
  how mutation handlers create rows. Scope it as its own RFC if it comes back.
- **Teams and Submissions are not backend-blocked.** `TeamService` is fully
  implemented, `CreateSubmission`/`FinalizeSubmission` included. The
  `submissions` page is a stub only because nobody wired it.
