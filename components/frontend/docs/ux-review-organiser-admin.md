# UX review — admin, organiser and owner surfaces

A review of the management capabilities across the admin, hackathon-organiser
and hackathon-owner roles: what each surface does today, where it misleads or
dead-ends, and what to change in what order.

- **Date:** 7 August 2026
- **Scope:** `components/frontend`, reviewed against `main`
- **Method:** five parallel code reviews, cross-checked against the proto
  definitions and backend handlers

Findings marked **[verified]** were confirmed directly in the source. The rest
come from the area reviews and are worth a quick check before acting on them.
**[backend]** marks work the frontend cannot complete alone.

> Several reviewed files were uncommitted working-tree modifications at the time
> of review, including the public hackathon page.

**Tally:** 9 × P0, 12 × P1, 9 × P2, 14 backend-blocked.

---

## Part one — what runs across every surface

Six patterns account for most of the individual findings. Fixing them at the
pattern level is cheaper than fixing twelve screens one at a time.

### 1. A design-system migration stopped halfway, and the unmigrated screens render unstyled

`P0` · **[verified]** · ~1 day, mechanical

The project moved off Skeleton to its own token theme. `package.json` has no
Skeleton dependency and `themes/hackagon.css` defines none of its classes — yet
`preset-filled-primary-500`, `preset-tonal-surface`, `bg-surface-100-900`,
`text-surface-950-50` and `text-primary-700-300` are still in the markup.
Tailwind v4 generates nothing for them, so those screens have no borders, no
card surface, invisible button states and raw `rounded-none` inputs.

This is the single highest visual payoff for the lowest effort in the whole
review, and it lands squarely on organiser-facing screens: the entire Pages area
and the Edit Hackathon form.

Affected: `pages/+page.svelte`, `pages/new/`, `pages/[pageId]/edit/`,
`PageForm.svelte`, `my/hackathon/[id]/edit/+page.svelte`,
`DashboardView.svelte:226`.

### 2. Everything an organiser types never reaches the public

`P0` · **[verified]** · **[backend]**

The public hackathon page is a hardcoded mock.
`(public)/hackathon/[id]/+page.server.ts` loads nothing — it returns `{}` — and
the component hardcodes the title "Open Research Data Hackathon 2026", its
dates, venue and an invented 42/100 registration count. Every hackathon id
renders the same page.

The homepage listing _is_ real (`(public)/+page.server.ts` calls
`list({visibilityFilter: PUBLIC})`), so a created hackathon appears by name and
then links to fabricated content. This is the "missing connection to the landing
page", and it has a backend root cause: `AllowPublicHackathonAccess` exists in
`rbac.go` and is never called, so public visibility grants no read permission at
all.

### 3. Destructive actions are one unguarded click, and successes are silent

`P0` · ~2 days across surfaces

Revoking an admin role, removing a participant, demoting an owner and revoking a
project approval all fire on a single click with no confirmation. The server
actions return success flags that no template renders, so a correct action and a
no-op look identical. Only errors are announced.

The admin Users page compounds it by using no `use:enhance` at all, unlike every
sibling management page — so each role change is a full navigation that clears
the search box and resets scroll.

### 4. Two review queues are dead ends

`P0` · **[verified]** · **[backend]** (projects only)

A join request can be approved but never declined — `Remove` renders only when
`!participant.isWaiting`, so waitlisted rows offer Approve alone. A project
proposal can be approved but never rejected: `ProjectStatus` has only `PROPOSED`
and `APPROVED`, and `Disapprove` means "revoke", returning the project to
indistinguishable-from-unreviewed.

Neither queue captures a reason, and neither tells the person who applied what
happened. Declining a join request works today with the existing
`RemoveParticipant` RPC; rejecting a project needs a new status.

### 5. Owner-facing numbers and states quietly mislead

`P1` · **[verified]** (vote count)

Three separate instances of the UI stating something that isn't so:

- Vote counts sum raw vote rows, but a points ballot writes one row per
  submission — so a 10-voter points category displays as "80 votes cast".
- "Public" in the create form means _listed_, not _viewable_, and the form never
  says so.
- The participant timeline shows a phase's planned capabilities without the real
  state beside them, so someone can read "Planned for this phase: Vote" while
  voting is off.

Worth noting what is **not** broken: the capability model is handled honestly
throughout the organiser UI. `PhaseForm` states outright "It does not turn these
actions on or off", `utils/phase.ts` comments "These are labels, not switches",
and `OrganizerStateAlert` surfaces the plan-vs-reality gap site-wide. The
participant timeline is the one place that gap leaks.

### 6. The owner navigates a mirrored information architecture

`P2` · architectural — discuss before building

`manageNav` builds a parallel "Manage" copy of most participant entries —
Participants / Manage Participants, Projects / Manage Projects, Timeline /
Manage Timeline, Voting / Manage Voting. That is eight manage destinations
beside nine participant ones in one rail, and every owner task begins by picking
the right one of two near-identical labels.

The split is deliberate and well-argued in the source
(`src/lib/navigation/items.ts:270`), and it does keep the participant spine
identical across roles. But consider whether an owner viewing a thing should
simply see actions on it, with a single "you are viewing as organiser"
affordance, rather than navigating to a separate mirror of it.

---

## Area A — Admin: manage users, roles and contact data

One flat page at `/(app)/manage/users`: a single table over an unpaginated
`UserService.List({})`, with a client-side substring search and per-row role
badges carrying a revoke `×`.

### A1 — The grant-role dropdown is one framework detail away from defaulting to Admin

`P0` · **[verified]** (structure) · 30 min

`ASSIGNABLE_GLOBAL_ROLES = [1, 2]` puts Admin first in the list, and the
intended "Organizer is the default" behaviour rests entirely on a bare
`selected={role === 2}` attribute inside an `{#each}` with no `bind:value`. The
adjacent comment states the intent explicitly; nothing enforces it.

**Fix:** bind the select to per-row state defaulting to 2. Confirm the current
behaviour in a browser first — the structure is verified, the rendered outcome
is not.

Refs: `manage/users/+page.svelte:198-207`, `lib/utils/globalRole.ts:15`.

### A2 — Role changes have no confirmation, no feedback and no in-place submit

`P0` · ~1 day

Granting Admin and revoking another admin's role are both single clicks on small
controls. The actions return `{assigned:true}` / `{removed:true}` and the
template renders only `form?.message`, so success is silent.

**Fix:** a two-step inline confirm on any revoke and on granting Admin,
following the pattern already used in `tracks/[trackId]/edit`; `use:enhance`
with a per-row pending set copied from `participants/manage`; an `aria-live`
success line naming the user and role; errors rendered per row rather than once
at the top.

### A3 — Contact data is a bulk address book with no handling affordances

`P1` · ~1 day

Every email renders in plaintext in the page payload, with no `mailto:`, no copy
control, no export and no indication that this view exposes personal data. An
organiser who wants to email their participants has to select text out of a
table.

**Fix:** truncated email with a copy button; "copy all emails" and CSV export
scoped to the current filter; a one-line note naming this as contact data.

### A4 — The page ships every user to the browser and offers no way to narrow them

`P1` · **[backend]** for scale

`ListRequest` is an empty message, so there is no server-side paging, search,
sort or role filter. The client has one substring box, no sortable columns, no
"show only admins", and a header count that reports the unfiltered total rather
than the match count.

**Fix now:** sortable Name / Joined / Roles headers, role filter chips, client
pagination around 50 rows, and a correct match count. **Fix properly:** paging
and filter arguments on `ListRequest`.

### A5 — Actions are off-screen on a phone

`P1`

The table carries `min-w-[720px]`, so changing a role on mobile means horizontal
scrolling inside a table.

**Fix:** below `sm`, drop the table for stacked cards matching
`ParticipantCard`.

### A6 — An admin cannot see what a user actually is across the platform

`P2` · **[backend]**

The page shows global roles only. There is no user detail route and no way to
answer "which hackathons is this person in, and as what" — which is the question
an admin usually has. `UserService.Get` exists; nothing aggregates memberships.

**Fix:** a `/manage/users/[id]` detail page, once a cross-hackathon membership
lookup exists.

---

## Area B — Organiser: create a hackathon, edit it, and get it in front of people

Create and Edit are the same six fields — name, visibility, start, end, logo
URL, markdown description. There is no draft or publish concept; visibility is
the only lever, and status is computed from the dates.

### B1 — An organiser cannot find the edit form for a hackathon they just created

`P0` · **[verified]** · **[backend]** (participant row)

The dashboard pencil is the only link to `/edit` anywhere in the codebase, and
it renders only for hackathons in "My hackathons" — which is built from
`list({participantId})`. Create writes no Participant row for the creator, so
your own hackathon lands in "Other hackathons", which renders no pencil and no
link at all. The post-create redirect URL is the only way in.

Edit is also deliberately absent from the sidebar, because `canEditHackathon`
additionally requires the owner be _confirmed_ while every other manage route
reduces to owner-or-admin — so listing it risks offering a link that then
refuses. The source comment already anticipates the fix.

**Fix:** add Edit to `manageNav` with a per-entry `canEditHackathon` gate, plus
a pencil on the Manage Hackathon page. Separately, have Create write the
creator's Participant row so the dashboard stops hiding their own hackathon.

Refs: `DashboardView.svelte:222-230`, `lib/navigation/items.ts:251`,
`dashboard/+page.server.ts:11-16`.

### B2 — Is reaching Edit from the dashboard alone acceptable?

`P0`

No — but the sidebar is not the whole fix. Dashboard-only would be defensible if
the dashboard reliably showed the pencil, but per B1 it often does not show the
hackathon at all. Fix the entry points in this order:

1. the missing participant row,
2. the sidebar entry,
3. a pencil on Manage Hackathon,
4. a "View as visitor" link, once the public page is real.

### B3 — "Public" is pre-selected and never explains that it means "live on the homepage now"

`P1`

The visibility radio defaults to public and says only "anyone can see it and ask
to join". The words landing page, homepage and live never appear. An organiser
publishes a title-only, dateless, description-less hackathon to the public
homepage without knowing they did.

**Fix:** say it at the radio — "Listed on the public homepage immediately" — and
add a post-create confirmation naming the public URL. If a staging concept is
wanted, that needs a draft field distinct from visibility.

### B4 — A new owner is greeted by a fault report

`P1` · ~half day

The first thing a freshly created hackathon shows its owner is "This hackathon
has no configuration record, so participants cannot do anything yet", plus a
warning bar — accurate, but offered as an error rather than as the next step.

**Fix:** a post-create checklist on the overview — add dates, write a
description, define phases, open registration — with the state warning folded
into it as the first item.

### B5 — A validation failure discards the whole form

`P1`

Errors surface as one string at the top and nothing repopulates from `form`, so
a rejected submit wipes a long markdown description.

**Fix:** repopulate from `form` and move messages to per-field. Also make Edit
redirect to the overview like Create does, rather than to the dashboard.

### B6 — Keep the form flat; don't build a wizard

`P2` · recommendation

Six fields is not too long. The problems here are discoverability and feedback,
not length, and a wizard would add steps to the one flow that currently works.
If it needs structure, group it into Basics / Schedule / Appearance fieldsets.

Also note: dates are optional but load-bearing — no dates means permanently
`PENDING` — and once set they can never be cleared, because Edit treats
undefined as "leave unchanged".

---

## Area C — Owner: participants, join requests and team assignment

Better news than expected here. Preferences _are_ already plumbed through to the
owner: `teams/manage/+page.server.ts` calls `project.exportPreferences` and
inverts it per user, and the board already does drag-and-drop between
per-project columns with an unassigned pool. The gap is narrower than "not
connected".

### C1 — Join requests can be approved but never declined

`P0` · **[verified]** · ~half day

Approve renders when `isWaiting`; Remove renders only when `!isWaiting`. So a
waitlisted person has exactly one possible outcome, and an owner who does not
want them has to leave the request pending forever. The backend already allows
it — `RemoveParticipant` deletes any participant row.

**Fix:** a Decline action on waitlisted rows reusing `RemoveParticipant`,
labelled "Decline" rather than "Remove".

Refs: `participants/manage/+page.svelte:95, :152`.

### C2 — There is no request queue; pending people are rows in the roster

`P0` · ~2 days

Someone waiting to be let in is a row with a "Waitlisted" badge among everyone
else, matchable by search only through the badge text. There is no sort by when
they applied (the loader drops `joinedAt`, which the data already carries), no
filter, and no bulk handling.

**Fix:** a "Pending requests (N)" section above the roster, sorted by
`joinedAt`, with multi-select and bulk Approve / Decline. Add status filter
chips — All · Pending · Members · Owners — to the roster below it.

### C3 — Preferences are technically present and practically unusable during assignment

`P1` · **[backend]** (rank field) · ~2–3 days

Each person's preferences appear comma-joined and truncated on a small chip in
the unassigned pool, and vanish once they are assigned. There is no reciprocal
"who wants this project" count on a team column, and no flag when someone has
been placed on a team they did not ask for. Preferences are also an unranked set
— `SetPreference` takes a project id with no rank or weight — so there is no
first choice to honour.

**Fix:** widen the pool into a table — name · preferred projects as one chip
each · current state — and put a "wants this" count on every team column header.
Tint a person's chip when their placement matches none of their preferences.

### C4 — Nothing anywhere carries a capacity

`P1` · **[backend]**

`Team`, `Project` and `Hackathon` all lack a size field, so a team column can
silently absorb thirty people and the owner has no target to assign against.

**Fix:** a team min/max on the schema, then `members / capacity` on each column
header. This is also the prerequisite for any auto-matching.

### C5 — Assignment is drag-only: no keyboard path, unusable on touch

`P1` · ~1.5 days

Pool chips are draggable divs with the a11y warning suppressed. There is no
alternative route to moving someone.

**Fix:** an "Assign to…" select on each pool row, plus multi-select → "Move
selected to team X". Batch the `move` action to take an array; it currently does
an N+1 team list and per-team removal on every single drop.

### C6 — Auto-matching is worth doing, but not yet

`P2` · **[backend]**

It needs three things that do not exist: ranked preferences, team capacity, and
any notion of skills. Without ranks, any matcher degenerates to first-come. When
it lands, make it "propose an assignment → owner reviews a diff → accept all or
per-row", never an auto-commit.

Related: `ParticipantCard` already accepts `skills`, `affiliation` and
`avatarUrl` props — every caller leaves them unset, because the user proto
carries none of them.

### C7 — Two latent hazards worth knowing about

`P2` · **[verified]** · **[backend]**

`RemoveParticipant` revokes only the Member casbin role and never Owner — safe
today only because the UI hides Remove for owners. And the one-team-per-person
invariant is enforced only in the frontend `move` action; `AssignUser` will
happily put someone on two teams.

Also: the whole `(participant)` route group is empty — bare directories with
zero files — so nothing serves `/hackathon/[slug]/teams`.

---

## Area D — Owner: timeline, phases, capabilities and pages

The headline worry going in was that the timeline UI promises control it does
not have. It does not — the capability model is stated honestly in the form
legend, the utility comments and a site-wide alert component. The real problems
are elsewhere.

### D1 — The Pages area is the worst-hit victim of the stalled theme migration

`P0` · **[verified]**

See cross-cutting theme 1. Timeline was migrated to the token theme; Pages was
not. Every file in the area — list, new, edit, and `PageForm` — renders without
card surfaces, borders or button states.

**Fix:** port to `card`/`card-raised`, `text-ink*`, `btn-solid`, `field`,
`badge-*`. Mechanical, roughly ten files.

### D2 — Every new phase jumps to the top of the timeline

`P0` · **[backend]**

`PhaseService.Create` accepts `starts_at` and `ends_at` and discards them — the
builder never calls the setters. Undated phases sort first. So adding a phase
puts it before the entire timeline until you separately open it and set dates,
which also makes adding a phase a two-visit job.

**Fix now:** sort undated phases last. **Fix properly:** have Create persist the
dates it is already given.

### D3 — The eye icon on a page row is both the state and the control

`P0` · quick

There is no text state and no badge, so it is ambiguous whether the icon shows
the page's current visibility or the action clicking it performs.

**Fix:** a "Hidden" / "Published" text badge beside the toggle, and label the
button by the action it takes. The sidebar already badges hidden pages correctly
— match it.

### D4 — Advancing the phase lives on a different page from the timeline

`P1` · ~1 day

Manage Timeline has only per-row "Make current" ghost buttons; the prominent
"Advance to X" button is over on Manage Hackathon. The one page showing the
phases in order is the one that cannot move you through them.

**Fix:** reuse `PhaseTimeline` as a header strip on Manage Timeline, mark the
current segment, and put the solid Advance button on that page.

### D5 — Nothing validates phase dates against each other

`P1`

`parsePhaseForm` checks one phase in isolation, so overlapping or gapped phases
pass silently.

**Fix:** compare against sibling phases and surface overlaps and gaps as a
warning, not a block — both are sometimes intentional.

### D6 — Participants see the plan without the reality

`P1`

The participant timeline lists a phase's planned capabilities as neutral badges.
On the _current_ phase, that can read "Planned for this phase: Vote" while
voting is off and the Vote nav entry is absent.

**Fix:** on the current phase only, render unmet capabilities dimmed or as "not
open yet". Also reword the organiser phase-form legend to state the effect
rather than only the non-effect: "Describes the phase — participants'
permissions are set on Manage Hackathon", with a link.

### D7 — Reorder is one round trip per step, and the batch RPC already exists

`P2`

`PageService.SetOrder` is implemented on the backend and unwired in the
frontend; the UI uses one POST per up/down chevron press.

**Fix:** drag-reorder against `SetOrder`. Also worth adding: preview-as-visitor,
page delete from the list rather than only inside edit, and setting the phase
link from the page side as well as the phase side.

---

## Area E — Owner: voting, project approval and tracks

The backend defines four voting methods; the frontend deliberately offers two,
and a ranked category created via the API renders a "Not votable here" badge
rather than breaking. That restraint is correct — the problems are around it.

### E1 — "N votes cast" counts rows, not voters

`P0` · **[verified]**

`SubmitVote` writes one vote row per submission, and the loader reduces over raw
rows with no grouping by voter. A ten-person points category reads as "80 votes
cast". There is no turnout denominator anywhere, so an owner cannot tell whether
voting is going well.

**Fix:** count distinct voters and show "12 of 40 confirmed participants voted"
— the eligible count is already in `hackathon.members`. A `GetCategoryTally` RPC
returning scores plus distinct voter count would fix this and E4 together.

Refs: `voting/manage/+page.server.ts:34`, backend `vote_service.go:626-636`.

### E2 — The owner picks a voting method from prose, never seeing the ballot

`P0` · ~1 day

Points and single-vote are described in one line each. The owner cannot see that
points renders number spinners with a live budget line while single-vote renders
radios — which is the actual difference they are choosing between.

**Fix:** a small live mock ballot beside the radios, driven by the same `method`
and `maxPoints` state the form already holds.

### E3 — Changing the method on a live category warns, then lets you do it anyway

`P0` · ~half day

The form shows a paragraph about losing existing votes and leaves Save enabled
directly beneath it.

**Fix:** disable Save behind an explicit "I understand, discard N votes"
checkbox, and offer "create a new category instead" as the safe path.

### E4 — Results hide the numbers that explain them

`P1`

Placements show position, title and project but never the score each received,
so an owner cannot see why something placed or how close it was. Ties render as
two identical ordinals with no marker, despite the sort explicitly handling
them.

**Fix:** show the score per placement and mark shared positions as tied. Promote
the four exports into a visible button group near the header.

### E5 — Approving a proposal costs a navigation, and rejecting one is impossible

`P1` · **[backend]** for reject

The queue has Approve and "Revoke approval" on rows, but the only way to read a
proposal is a detail route that deliberately carries no actions — so reviewing
means going there, coming back, and deciding from memory. There is no bulk
select, no reason capture, and no rejection at all.

**Fix:** expand-in-place descriptions so reading costs nothing; checkbox
multi-select with "Approve selected"; the same Approve / Revoke actions on the
detail page. Real rejection needs a `PROJECT_STATUS_REJECTED` plus a reason
field.

### E6 — The proposer learns nothing after submitting

`P1` · ~half day

Approved proposals disappear from the proposer's list, and the empty state
guesses at why. No decision date, no reviewer, no feedback.

**Fix:** keep approved proposals on the page with an Approved badge and a
decision date rather than removing them.

### E7 — Tracks are an isolated CRUD island

`P1` · **[backend]** for awards

A track is a name and a markdown description with one Edit link. No project
count, no link to a filtered project list, no delete in the UI even though the
RPC exists, and no warning that deleting one silently orphans every project's
`trackId`. Nothing in the schema connects a track to a vote category, so "best
project in track X" is not expressible — an owner must hand-build a category per
track and hand-place the winners.

**Fix:** project count per track linking to a filtered list; a track filter on
both project lists; delete behind an "N projects will lose their track" confirm.
If per-track awards are intended, `VoteCategory` needs an optional `track_id`.

### E8 — Jury voting exists in the data model and is unreachable from the UI

`P2` · **[backend]**

`voterType` and `juryMemberIds` have no control; the form only apologises for
their absence. Separately, points ballots are write-once — there is no
`EditVote`, so "change my vote" is not true for points.

**Fix:** a jury roster editor once it is a priority; until then, the honest note
the form already carries is the right behaviour.

---

## Part three — what the frontend cannot fix alone

Consolidated from all five areas. The top three block the most UX work per unit
of backend effort.

| Gap                                                   | Blocks                                                  | Priority |
| ----------------------------------------------------- | ------------------------------------------------------- | -------- |
| `AllowPublicHackathonAccess` defined, never called    | The entire public hackathon page; every non-member read | P0       |
| `Create` writes no Participant row for the creator    | Finding your own hackathon; the edit pencil             | P0       |
| `PhaseService.Create` discards `starts_at`/`ends_at`  | Adding a phase in one visit; timeline ordering          | P0       |
| No `PROJECT_STATUS_REJECTED` and no reason field      | Honest proposal rejection; proposer feedback            | P1       |
| No aggregate on `ListVotes`                           | Turnout, per-submission scores, tie detection           | P1       |
| Preferences have no rank or weight                    | Preference-aware assignment; any auto-matcher           | P1       |
| No capacity on `Team`, `Project` or `Hackathon`       | Assigning against a target; waitlist logic              | P1       |
| `ListRequest` for users is an empty message           | Server-side search, paging, sort, role filter           | P1       |
| No user profile fields — skills, affiliation, avatar  | Informed assignment; `ParticipantCard`'s unused props   | P1       |
| `Edit` cannot clear dates (undefined means unchanged) | Correcting a mistyped schedule                          | P2       |
| No bulk RPCs anywhere (approve, assign, grant role)   | Bulk UI degrades to N round trips                       | P2       |
| No audit trail on any role or status change           | Undo; "who approved this"; admin accountability         | P2       |
| No cross-hackathon membership lookup                  | A user detail page worth having                         | P2       |
| `DeleteVoteCategory` does not cascade                 | Deleting a category reads as "something broke"          | P2       |

---

## Part four — a suggested order of work

Sequenced by payoff per unit of effort, and by what unblocks what.

1. **Finish the theme migration.** Purely mechanical, roughly ten files, no
   design decisions, and it turns the Pages area and the Edit form from
   broken-looking into finished. Nothing else in this list changes the perceived
   quality of the product as cheaply. Grep for `preset-` and `-100-900` to find
   every case.

2. **Make the destructive actions safe and the successful ones legible.** One
   confirm pattern and one success-feedback pattern, applied across admin users,
   participants and projects. Add `use:enhance` to the admin Users page so it
   stops full-reloading. Fix the role-select binding while you are in there.

3. **Close the two dead-end queues.** Decline for join requests works against
   today's API — ship it now, with a pending-requests section and bulk actions.
   Project rejection waits on the new status, so scope that backend change in
   the same breath.

4. **Build the real public hackathon page.** The largest product gap. It needs
   the backend read permission first, so start that in parallel. Delete the mock
   as part of the same change — leaving it in place risks it shipping.

5. **Fix what the owner is told: vote turnout, entry points, public meaning.**
   Distinct-voter counts, Edit reachable from the sidebar and Manage Hackathon,
   "public" explained at the radio, and undated phases sorted last. Individually
   small, and together they remove most of the ways the UI currently misinforms.

6. **Then the bigger builds.** Preference-first team assignment with capacity,
   the single timeline canvas with in-place advance, the voter-experience
   preview, and track-to-project linkage. Each wants a backend field first,
   which is why they come last rather than because they matter least.
