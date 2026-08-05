# Bringing main's design and screens onto this branch

Written 2026-08-05, comparing `sketch/04-08-26` (this branch) with `origin/main`
(`6f8c7346`). A worktree of main sits at `../hackagon-main` for side-by-side
reading.

**Direction: main's work comes to us.** We keep this branch's backend and its
feature surface, and take main's design system, shell, navigation model and
per-entity CRUD screens on top.

That is cheaper than it looks. The backend delta runs almost entirely in our
favour — 65 RPCs to their 48, and we serve three whole services they do not
have (voting, prizes, config). Only **four RPCs** have to come the other way.
The bulk of the work is frontend, and most of it is mechanical.

## What main actually changed

Not a reskin. Four things, in descending order of how much they constrain us:

1. **A token-based theme** (`src/themes/hackagon.css`, 578 lines). `--hk-*`
   custom properties in oklch, redefined per colour mode, exposed to Tailwind
   via `@theme`. It replaces `hackathonsdsc.css` and, with it, the
   `bg-surface-100-900` mode-pair machinery **every component of ours is
   written in**. This is the single biggest cost in the migration.
2. **A different app shell.** The top bar carries identity, theme and sign-out
   only; per-hackathon navigation moved into a `HackathonSidebar` rendered
   inside `my/hackathon/[id]`, because as shell chrome it followed you onto the
   dashboard where it had nothing to say.
3. **A navigation model** (`lib/navigation.ts`, with tests). Sections, stable
   ids that never derive from editable titles, role chips per section, one
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
| Batch capability toggle, preference read, suggested results | **yes** | **ported** (see Phase 1) |
| Prizes, config, site-page services | no | **yes** (3 services) |
| Platform CMS (About/Privacy/Terms + `/manage/pages`) | no | **yes** |
| Invitation links for private events | no | **yes** |
| Account page, `EditProfile`, `DeleteAccount` | no | **yes** |
| Registration forms: define, fill, read back, edit | no | **yes** |
| Public browse page, event SEO/OpenGraph | no | **yes** |
| Email composer, event branding | no | **yes** |
| Search/filter/table views on lists | no | **yes** |

## The plan

Six phases. Each ends green and is independently shippable — this must not
land as one merge.

### Phase 0 — baseline (half a day)

- Branch `feat/main-design` from this branch.
- Record the baseline: journey 272, smoke 66, mobile 14, units 39. Any number
  that drops later is a regression, not a surprise.
- Keep `../hackagon-main` as the reference worktree.

### Phase 1 — backend delta first — **DONE**

Two of the four candidates landed; the other two were not what they looked like.

- **`SetCapabilities`** — ported. A batch toggle is genuinely additive next to
  our single-capability `EditCapability`, and their settings screen sends one
  request per screenful. Their `CapabilityState` message collided with our
  `CapabilityState` **enum** (COMING/OPEN/CLOSED/UNGOVERNED) in the same proto
  package, so ours keeps the name and theirs became `CapabilityToggle` — which
  is also the truer name: it carries an intent, not the four-state answer the
  server computes. The response returns `CapabilityStatus`, so a caller sees
  the state a phase window forced rather than the boolean it sent.
- **`GetPreference`** — ported, and it closes a standing TODO: `ExportPreferences`
  is organiser-only, so a participant had no way to see a choice that is final
  by policy. Reads only the caller's own row, so it needs no permission beyond
  being signed in.
- **`SetCurrentPhase`** — **not ported.** It is our `AdvancePhase` under
  another name: both take an explicit `phase_id`. Theirs writes a separate
  `HackathonState` table they introduced and ours writes the hackathon row and
  advances the scheduled capabilities with it — adopting theirs would be a
  schema migration, not a frontend change. Their screens get a one-line call
  change instead. Theirs can *clear* the current phase, which ours cannot;
  worth adding to `AdvancePhase` later.
- **`SuggestResults`** — deferred, deliberately. It is 103 lines and its
  aggregation rule (sum vs mean) is an open decision in TODO.md; porting it in
  passing would settle that question by accident.

**Decide, do not merge:** participant approval and multiple owners exist on both
sides. Their screens are written against theirs, so theirs wins unless ours has
a behaviour we pinned in the recipe. Check `AddOwner`/`RemoveOwner` — proto-only
stubs here (audit B15), implemented there.

### Phase 2 — theme and shell (the design)

Take wholesale, no edits: `themes/hackagon.css`, `app.html`, `NavBar`,
`AppSidebar`, `HackathonSidebar`, `SidebarNavSection`, `SidebarUserFooter`,
`lib/navigation.ts` + its tests, `MarkdownContent`, `MarkdownEditor`.

Then the mechanical bulk: **reclass every component of ours** from
`bg-surface-100-900`-style pairs to the new tokens. Ours that survive and need
this: `HackathonRow`, `HackathonCard`, `DataToolbar`, `DataTable`,
`RowActions`, `EmailComposer`, `EventBranding`, the vote components,
`ParticipationCard`, `CtaSection`, `HeroSection`.

Expect the light/dark screenshots to be the check that catches what typing
cannot.

### Phase 3 — take their routes where we have nothing better

Wholesale: `pages/**`, `tracks/**`, `timeline/**`, `projects/**` (including
`proposals/propose`), `teams/manage`, `participants`, `edit`,
`hackathons/create`, `dashboard`, `manage/users`.

Retire ours as each lands: our `manage` cockpit (only after Phase 4 redistributes
it), `proposals/`, `hackathon/create` (note the rename to plural `hackathons/`).

### Phase 4 — re-home our exclusive features into their IA

The only part with real design decisions.

| Ours | Destination in their information architecture |
| --- | --- |
| `/account` | `SidebarUserFooter`, next to sign-out |
| `/register/[id]` | reached from the dashboard join action and event overview, as now |
| `[slug=sitepage]`, `/manage/pages` | Platform section, beside Users |
| `(public)/hackathon` browse | public nav: Home · Hackathons · About |
| `invite/[token]` | public, unlinked by design (the token is the credential) |
| Windows, capabilities, settings | their existing `…/edit` |
| Registration + submission form builders | new `…/forms` under Manage |
| Invitation links | new `…/invites` under Manage |
| Email templates + composer | new `…/email` under Manage |
| Branding | fold into `…/edit` |
| Prizes | new `…/prizes` |
| Voting, photos, webinars | keep as routes, add nav entries |

`Seo.svelte`, `sitePageSlug.ts`, the `sitepage` param matcher, `returnTo.ts`
and the `publicOrigin` layout load have no visual surface and move unchanged.

### Phase 5 — tests (the expensive part, budget it)

The recipe is our product spec and addresses screens by URL. Routes main does
not have are referenced **15×** (`/manage/pages`), **8×** (`/account`), **3×**
each for `/hackathon/create` and `/register/`, plus `/voting`, `/webinars`,
`/photos`, `/proposals`. `hackathons/create` is plural there.

- Remap URLs across the 278 actions; **re-specify, never delete** — an action
  that loses its assertion loses the pin silently. Action count may only go up.
- Smoke selectors will break on classes and headings, not just paths.
- Re-run journey, smoke, mobile, units, and the theme screenshots.

### Phase 6 — docs and screenshots

Regenerate `docs/flows/` (the generator drives the real UI, so it re-shoots
itself), update `user-flows.md`, and refresh the status block in
`.claude/CLAUDE.md`.

## Risks

- **Two implementations of the same feature.** Approve/remove participants and
  multiple owners. Pick one per feature deliberately; do not let a merge decide.
- **The reclass is where the bugs hide.** A component that types fine can still
  be unreadable in one mode. The light/dark screenshot pass is not optional.
- **`.claude/` is gitignored**, so the e2e skill, its 278-action recipe and the
  tunnel tooling do not exist on main's side. They travel with the working
  copy, not the branch — nothing to merge, but nothing to inherit either.
- **Route renames are silent breakage.** `/hackathon/create` →
  `/hackathons/create` and `/proposals` → `/projects/proposals` will not fail a
  type check.

## What I would not bring

- Their `dashboard` if it loses our membership badges — check before replacing.
- Anything that would drop the markdown sanitiser, the invite token's
  indistinguishable failure modes, or the `noindex` on signed-in pages.
