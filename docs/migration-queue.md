# Porting queue

Phase 2 swapped main's `components/frontend/src` in wholesale, which removed 47
files of ours. **Nothing is lost** — git is the staging area:

```
git show bd16ddc5:components/frontend/src/<path>        # the file as it was
git checkout bd16ddc5 -- components/frontend/src/<path> # bring it back
```

`bd16ddc5` is the last commit before the swap. Each item below is re-added
**reclassed to the new theme**, not restored verbatim: Skeleton is gone, so
`card preset-outlined-surface-200-800` → `card`,
`btn preset-filled-primary-500` → `btn btn-accent`,
`badge preset-tonal-success` → `badge badge-success`,
`input`/`select`/`textarea` → `field`/`field-area`, and the `surface-N-N`
utilities → the `--hk-*` tokens (`bg-canvas` `bg-surface` `bg-raised`
`text-ink` `text-ink-2` `text-ink-3` `border-line`).

## Blocking — the app is incomplete without these

- [x] **Account page** — `routes/(app)/account/**`. Backs `EditProfile` and
      `DeleteAccount`, which no other screen calls. Reclassed to the tokens and
      linked from `SidebarUserFooter`, next to sign-out.
- [x] **Registration form** — `routes/(app)/register/[id]/**`. Reclassed.
- [x] **Platform CMS** — pages CMS, the `[slug=sitepage]` route, the slug
      rules and the reserved-slug logic in `hooks.server.ts`. `/about` and
      `/privacy` serve 200 anonymously again. The public page renders through
      main's `MarkdownContent` (marked + DOMPurify) rather than our deleted
      `MarkdownSection`.
- [x] **Invitations** — `routes/(public)/invite/[token]/**`. Malformed and
      unknown tokens both 404, indistinguishably, as before.

## High value

- [x] **Browse page** — `routes/(public)/hackathon/**` + `HackathonCard`.
      Reclassed, and the card now takes a `badgeVariant` (their vocabulary)
      rather than a Skeleton `badgePreset`. Main's nav pointed Hackathons,
      Challenges and About all at `/`; Hackathons and About now have real
      destinations and Challenges is gone until it has a backing entity.
- [x] **SEO** — `Seo.svelte` and the `publicOrigin` derivation are back.
      Still to do: re-add its call sites on the landing and event pages.
- [x] **List ergonomics** — `lib/components/data/**` + `dataView.ts`
      recovered and reclassed; the pages CMS uses them. Still to do: apply to
      main's participants and users pages, which have a bare search box.
- [ ] **Markdown sanitiser tests** — `lib/utils/markdown*.ts`. Main sanitises
      with the same libraries but ships no tests for it. Port the 23 cases even
      though their `MarkdownContent` supersedes our renderer.
- [x] **returnTo safety** — restored, and `hooks.server.ts` validates the
      parked path again instead of trusting the query string.

## Organiser cockpit — redistribute, do not restore

`routes/(app)/my/hackathon/[id]/manage/**` was one page because there was
nowhere else to put these. Main has somewhere else, so each section moves:

- [x] Windows → `…/windows` (a route of its own, not folded into `edit`: six
      datetimes plus the override would have swamped a four-field form). This
      needed a NEW backend RPC — see below. Capabilities already live on their
      timeline page. Settings still to move.
- [x] Registration + submission form builders → `…/forms`, with a
      `manage:forms` nav entry. The builder posts parallel arrays rather than
      JSON, so it works without JavaScript and a half-filled row is recoverable;
      duplicate keys are rejected, because a repeated key silently overwrites
      the earlier question's answers.
- [x] Invitation links → `…/invites`, with a `manage:invites` entry in
      `navigation.ts`. Copy-link, revoke, and the full URL shown rather than a
      truncated hint — it is a credential someone has to paste somewhere.
- [ ] Email templates + `EmailComposer.svelte` → new `…/email`
- [ ] `EventBranding.svelte` → fold into `…/edit`
- [ ] Prizes → new `…/prizes`

## Keep as routes, add nav entries

- [ ] `voting/**` + `lib/components/vote/**` (BallotCard, ResultsList,
      ExportPanel)
- [ ] `photos/**`, `webinars/**`
- [ ] `proposals/export/+server.ts` — the CSV export; main's `projects/proposals`
      has no equivalent

## Superseded — do not restore

- `themes/hackathonsdsc.css` (replaced by `themes/hackagon.css`)
- `lib/components/hackathon/HackathonSidebar.svelte`, `HackathonSubNav.svelte`
  (replaced by `lib/components/layout/HackathonSidebar.svelte` + `navigation.ts`)
- `routes/(app)/hackathon/create/**` (theirs is `hackathons/create`, plural)
- `routes/(app)/my/hackathon/[id]/proposals/**` (theirs is
  `projects/proposals`) — except the export endpoint above
- `lib/components/hackathon/ProposalCard.svelte` (theirs is `ProjectCard`)

## Backend gaps the port exposed

- **`ConfigService.GetWindows` — added.** There was no read RPC for deadlines:
  the old cockpit only ever displayed what a write returned. `SetWindows`
  replaces every field, so a form that cannot prefill makes saving destructive —
  edit one deadline and the others you never saw are blanked. Read permission is
  hackathon `Read`, not `Write`: deadlines are announced to participants.
- **`GetPrizes` is still missing**, and the prizes screen will hit exactly the
  same trap when it lands.

## Known adaptation, not yet done

**Phase ↔ capability link direction — DONE.** Their timeline wrote
`Phase.capabilities`, where a phase declares which capabilities it turns on.
Ours puts the link on the capability (`open_in_phase_id`), so a capability
names its own schedule and there is one place to look when asking "when does
voting open". Ours stays. `phaseForm.ts` gained two translators:
`phaseCapabilities()` reads the relationship from the capability end, and
`syncPhaseCapabilities()` writes a phase form's checkboxes back as one
`EditCapability` per capability that actually changed — unchanged rows are
skipped so `modified_at` and the modifier stay meaningful.

Already adapted: `Hackathon.state.{currentPhaseId,capabilities}` → our flat
`currentPhaseId` / `capabilities`, and `setCurrentPhase` → `advancePhase`
(`enabledCapabilities` now reads the four-state `CapabilityStatus`, where
"switched on" means OPEN rather than `enabled: true`).

## Tests

Not started. The recipe addresses screens by URL and references routes that
moved or vanished — `/manage/pages` ×15, `/account` ×8, `/register/` ×3,
`/hackathon/create` ×3 (now plural), plus `/voting`, `/webinars`, `/photos`,
`/proposals`. Re-specify, never delete.
