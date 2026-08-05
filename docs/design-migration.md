# Adopting main's design on this branch

Written 2026-08-05, comparing `sketch/04-08-26` (this branch, `d0aa6098`) with
`origin/main` (`6f8c7346`). A worktree of main sits at `../hackagon-main` for
side-by-side reading.

**The short version:** main's frontend is the better base and should be taken
wholesale. This branch's advantage is not its design — it is a wider feature
surface (65 RPCs against main's 48) that main has no screens for. The work is
porting our surface onto their design, not the reverse.

## What main actually changed

Not a reskin. Four things, in descending order of how much they constrain us:

1. **A token-based theme** (`src/themes/hackagon.css`, 578 lines). `--hk-*`
   custom properties in oklch, redefined per colour mode, exposed to Tailwind
   via `@theme`. It replaces `hackathonsdsc.css` and, with it, the
   `bg-surface-100-900` mode-pair machinery every component of ours is written
   in. **Every component we port has to be reclassed.**
2. **A different app shell.** The top bar carries identity, theme and sign-out
   only; per-hackathon navigation moved into a `HackathonSidebar` rendered
   inside `my/hackathon/[id]`, because as shell chrome it followed you onto the
   dashboard where it had nothing to say.
3. **A navigation model** (`lib/navigation.ts`, with tests). Sections, stable
   ids that never derive from editable titles, role chips per section, and one
   active-match pass across all sections. Adding a destination means adding an
   entry here, not writing an anchor.
4. **Per-entity CRUD depth.** Where we built one long `manage` cockpit, main
   built routes: `pages/new`, `pages/[pageId]/edit`, `tracks/new`,
   `tracks/[trackId]/edit`, `timeline/new`, `timeline/[phaseId]/edit`,
   `projects/[projectId]/edit`, `projects/proposals/propose`, `teams/manage`.

Their markdown rendering sanitises with `marked` + `isomorphic-dompurify`, the
same posture as ours — nothing to defend there.

## Where the two branches stand

| Capability | main | this branch |
| --- | --- | --- |
| Design tokens, sidebar shell, nav model | **yes** | no |
| Organiser CRUD for pages/tracks/phases/projects | **yes**, per-entity routes | one `manage` cockpit |
| Multiple owners, capabilities, current phase, suggested results | **yes** (4 RPCs) | no |
| Platform CMS (About/Privacy/Terms + `/manage/pages`) | no | **yes** |
| Invitation links for private events | no | **yes** (`HackathonInvite`) |
| Account page, `EditProfile`, `DeleteAccount` | no | **yes** |
| Registration forms: define, fill, read back, edit | no | **yes** |
| Public browse page, event SEO/OpenGraph | no | **yes** |
| Email composer, event branding | no | **yes** |
| Voting UI, photos, webinars | no | **yes** |
| Search/filter/table views on lists | no | **yes** (`lib/components/data`) |

## Strategy

**Rebase our features onto main, not main onto us.** Their design is a system
with rules; ours is a set of screens. Re-theming their 25 routes into our idiom
would cost more and leave us with the weaker structure.

Concretely: branch from `origin/main`, then port in the order below. Each item
is independently shippable, so this does not need to land as one merge.

### 1. Take main as-is, verify it, then port (blocking)

Nothing else starts until the suite runs against main's routes. The e2e recipe
is our product spec and it addresses screens by URL — routes main does not have
are referenced **15×** (`/manage/pages`), **8×** (`/account`), **3×** each for
`/hackathon/create` and `/register/`, plus `/voting`, `/webinars`, `/photos`,
`/proposals`. `/hackathon/create` is `/hackathons/create` there (plural).

Budget this properly: the recipe is 278 actions and the URL remap is mechanical
but wide. Re-specify, do not delete — the same rule that applied when fixing a
bug turned an action red.

### 2. Port the public surface (high value, low conflict)

main's `(public)` is two pages: landing and event detail. Everything else of
ours slots in beside it without touching their app shell:

- `[slug=sitepage]` + `sitePageSlug.ts` + the `sitepage` param matcher, and the
  `/manage/pages` CMS behind it. Needs the `SitePage` backend, which main lacks.
- `(public)/hackathon` browse page — reclass `HackathonCard` to the new tokens.
- `invite/[token]` — needs `HackathonInvite`.
- `Seo.svelte` — no visual surface at all, drops in unchanged apart from the
  `publicOrigin` layout load it depends on.

### 3. Port the participant surface

- `/account` (profile edit, GDPR deletion) → main's nav has no home for it; it
  belongs in `SidebarUserFooter` next to sign-out.
- `/register/[id]` (fill and edit registration answers) → reachable from the
  dashboard join action and the event overview, as here.

### 4. Fold our cockpit into their per-entity routes

This is the only part with real design decisions. Our `manage` page holds ~15
sections; main has routes for pages, tracks, phases, projects and teams
already. The remainder needs homes:

| Ours | Suggested destination in their IA |
| --- | --- |
| Windows, capabilities, settings | `my/hackathon/[id]/edit` (exists) |
| Registration + submission form builders | new `…/forms` entry under Manage |
| Invitation links | new `…/invites` entry under Manage |
| Email templates + composer | new `…/email` entry under Manage |
| Branding | fold into `…/edit` |
| Prizes | new `…/prizes`, or fold into results |

### 5. Re-add the list ergonomics

`DataToolbar` / `DataTable` / `RowActions` are ours alone and main's lists grow
the same way. Reclass to the tokens and apply to participants, users, tracks,
pages. Keep the toolbar's hydration caveat documented — it is invisible and
costs an hour to rediscover.

### 6. Backend

Ours is a superset except four RPCs to take from main: `GetPreference`,
`SetCapabilities`, `SetCurrentPhase`, `SuggestResults`. Everything else main
calls, we already serve. Expect churn where both sides implemented the same
idea differently — participant approval and multiple owners exist on both.

## What I would not port

- Our `manage` cockpit as a page. It exists because there was nowhere else to
  put those controls; main has somewhere else.
- `HackathonSubNav`. Their sidebar replaces it.
- Our `hackathonsdsc.css` theme.

## Risks

- **Two implementations of the same feature.** Approve/remove participants and
  multiple owners were built on both sides. Pick one per feature deliberately.
- **The recipe is the spec.** If a re-specified action loses an assertion, we
  lose the pin silently. Diff action count before and after; it should only go
  up.
- **`.claude/` is gitignored**, so the e2e skill, its 278-action recipe and the
  tunnel tooling do not exist on main's side of the comparison. They travel
  with the working copy, not the branch.
