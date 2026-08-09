# Porting queue

Phase 2 swapped main's `components/frontend/src` in wholesale, which removed 47
files of ours. **Nothing is lost** — git is the staging area:

```
git show bd16ddc5:components/frontend/src/<path>        # the file as it was
git checkout bd16ddc5 -- components/frontend/src/<path> # bring it back
```

`bd16ddc5` is the last commit before the swap. Each item below is re-added
**reclassed to the new theme**, not restored verbatim: Skeleton is gone, so
`card preset-outlined-surface-200-800` → `card`, `btn preset-filled-primary-500`
→ `btn btn-accent`, `badge preset-tonal-success` → `badge badge-success`,
`input`/`select`/`textarea` → `field`/`field-area`, and the `surface-N-N`
utilities → the `--hk-*` tokens (`bg-canvas` `bg-surface` `bg-raised` `text-ink`
`text-ink-2` `text-ink-3` `border-line`).

## Blocking — the app is incomplete without these

- [x] **Account page** — `routes/(app)/account/**`. Backs `EditProfile` and
      `DeleteAccount`, which no other screen calls. Reclassed to the tokens and
      linked from `SidebarUserFooter`, next to sign-out.
- [x] **Registration form** — `routes/(app)/register/[id]/**`. Reclassed.
- [x] **Platform CMS** — pages CMS, the `[slug=sitepage]` route, the slug rules
      and the reserved-slug logic in `hooks.server.ts`. `/about` and `/privacy`
      serve 200 anonymously again. The public page renders through main's
      `MarkdownContent` (marked + DOMPurify) rather than our deleted
      `MarkdownSection`.
- [x] **Invitations** — `routes/(public)/invite/[token]/**`. Malformed and
      unknown tokens both 404, indistinguishably, as before.

## High value

- [x] **Browse page** — `routes/(public)/hackathon/**` + `HackathonCard`.
      Reclassed, and the card now takes a `badgeVariant` (their vocabulary)
      rather than a Skeleton `badgePreset`. Main's nav pointed Hackathons,
      Challenges and About all at `/`; Hackathons and About now have real
      destinations and Challenges is gone until it has a backing entity.
- [x] **SEO** — `Seo.svelte` and the `publicOrigin` derivation are back. Still
      to do: re-add its call sites on the landing and event pages.
- [x] **List ergonomics** — `lib/components/data/**` + `dataView.ts` recovered
      and reclassed. Every management list uses them now: platform pages, the
      browse page, `/manage/users` (role filter, table by default) and the
      participants roster (status filter, confirmed and waitlisted as ONE list
      with the split as a column — two tables would sort each half separately).
- [x] **Markdown sanitiser tests** — restored, and the renderer with them. Their
      `MarkdownContent` did NOT supersede ours: it kept DOMPurify's DEFAULT
      allowlist (forms, svg, math survive it), where `lib/utils/markdown.ts` is
      the audited allowlist plus the iframe host list and `rel=noopener`. Both
      components render through it now. `MarkdownSection` had also been changed
      to take raw HTML — correct for its one caller, the public event page's
      mock — while photos, webinars and the invite page passed it markdown,
      which rendered as literal `#` and `*`.
- [x] **returnTo safety** — restored, and `hooks.server.ts` validates the parked
      path again instead of trusting the query string.

## Organiser cockpit — redistribute, do not restore

`routes/(app)/my/hackathon/[id]/manage/**` was one page because there was
nowhere else to put these. Main has somewhere else, so each section moves:

- [x] Windows → `…/windows` (a route of its own, not folded into `edit`: six
      datetimes plus the override would have swamped a four-field form). This
      needed a NEW backend RPC — see below. Capabilities already live on their
      timeline page. Settings still to move.
- [x] Registration + submission form builders → `…/forms`, with a `manage:forms`
      nav entry. The builder posts parallel arrays rather than JSON, so it works
      without JavaScript and a half-filled row is recoverable; duplicate keys
      are rejected, because a repeated key silently overwrites the earlier
      question's answers.
- [x] Invitation links → `…/invites`, with a `manage:invites` entry in
      `navigation.ts`. Copy-link, revoke, and the full URL shown rather than a
      truncated hint — it is a credential someone has to paste somewhere.
- [x] Email templates + `EmailComposer.svelte` → `…/email`, with a
      `manage:email` entry. Needed `ConfigService.GetEmailTemplates` — third
      time for the same reason (see below). Audiences derive from the roster,
      and confirmed participants is the default for all four moments:
      "Registration confirmed" to the waitlist tells the wrong people they are
      in.
- [x] `EventBranding.svelte` → folded into `…/edit` as its own form (its own
      RPC, so one submit that half-succeeds is not a thing), with the real
      component as the live preview. That page was still painting Skeleton
      colours — it survived the swap unreclassed.
- [x] Prizes → `…/prizes`, with a `manage:prizes` nav entry. Needed
      `PrizeService.Get` for the same reason as windows.

## Keep as routes, add nav entries

- [x] `voting/**` + `lib/components/vote/**` — restored and reclassed, with a
      `member:voting` entry after Submissions, the order it happens in.
- [x] `photos/**`, `webinars/**` — restored, and their nav entries appear only
      when a page reads like a gallery or a session line-up. The title hints
      moved to `lib/pageCollections.ts` so the nav and the loaders cannot
      disagree about whether there is anything to collect.
- [x] `proposals/export/+server.ts` — restored.

## Superseded — do not restore

- `themes/hackathonsdsc.css` (replaced by `themes/hackagon.css`)
- `lib/components/hackathon/HackathonSidebar.svelte`, `HackathonSubNav.svelte`
  (replaced by `lib/components/layout/HackathonSidebar.svelte` +
  `navigation.ts`)
- `routes/(app)/hackathon/create/**` (theirs is `hackathons/create`, plural)
- `routes/(app)/my/hackathon/[id]/proposals/**` (theirs is `projects/proposals`)
  — except the export endpoint above
- `lib/components/hackathon/ProposalCard.svelte` (theirs is `ProjectCard`)

## Backend gaps the port exposed

- **`ConfigService.GetWindows` — added.** There was no read RPC for deadlines:
  the old cockpit only ever displayed what a write returned. `SetWindows`
  replaces every field, so a form that cannot prefill makes saving destructive —
  edit one deadline and the others you never saw are blanked. Read permission is
  hackathon `Read`, not `Write`: deadlines are announced to participants.
- **`PrizeService.Get` — added**, for exactly the reason predicted: `Set`
  replaces the whole table, so the prizes screen would have blanked rows the
  organiser could not see. Also gated on hackathon `Read`: the prize list is
  what an event advertises, and the awards are the published result.
- **`ConfigService.GetEmailTemplates` — added**, same shape a third time. Gated
  on `Write`, not `Read`: deadlines are announced to participants, but unsent
  notification copy is the organisers' own drafting.

Three write-only RPCs in a row is a pattern, not a coincidence: every `Set*`
that replaces a whole record needs a `Get*`, or the form that drives it is
destructive by construction.

## Known adaptation, not yet done

**Phase ↔ capability link direction — DONE.** Their timeline wrote
`Phase.capabilities`, where a phase declares which capabilities it turns on.
Ours puts the link on the capability (`open_in_phase_id`), so a capability names
its own schedule and there is one place to look when asking "when does voting
open". Ours stays. `phaseForm.ts` gained two translators: `phaseCapabilities()`
reads the relationship from the capability end, and `syncPhaseCapabilities()`
writes a phase form's checkboxes back as one `EditCapability` per capability
that actually changed — unchanged rows are skipped so `modified_at` and the
modifier stay meaningful.

Already adapted: `Hackathon.state.{currentPhaseId,capabilities}` → our flat
`currentPhaseId` / `capabilities`, and `setCurrentPhase` → `advancePhase`
(`enabledCapabilities` now reads the four-state `CapabilityStatus`, where
"switched on" means OPEN rather than `enabled: true`).

## Tests — triaged, not yet repaired

Auth setup passes again: the login helper asserted an avatar **button**, and
this design renders identity as a `<span>` monogram on purpose ("identity, not
an action to be drawn toward"), so a role-based locator found nothing even
though login had succeeded. All four personas sign in.

Smoke failures by file, and what each actually needs:

| Spec                                                                      | Cause                                                                                                                  | Fix                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `07-account-menu`                                                         | The account menu **does not exist** in this design — identity is a monogram, sign-out is a top-bar button              | ✅ rewritten against the new IA (13/13) |
| `02-login`                                                                | Nav labels and hrefs differ; sign-out is a button, not a menu item                                                     | ✅ re-specified (16/16)                 |
| `03-dashboard`                                                            | Structure survived; the membership badge moved OUTSIDE the row link, so rows are reached as the link's grandparent now | ✅ repaired (16/16)                     |
| `04-access-control`, `01-anonymous`, `06-cms-pages`, `05-new-user-funnel` | Nothing structural — both "failures" were 20s timeouts under a dev server recompiling mid-run                          | ✅ pass at `--timeout=60000`            |

**All suites green.** Journey **271/271**, smoke **69/69**, mobile **16/16**,
frontend units **154/154**, `svelte-check` 0 errors.

The journey took nine runs to get there, one failure per run — the story is
`mode: "serial"`, so a failure skips the tail. Worth the wall-clock: it found
more product bugs than reading the diff did, because it drives the app the way a
person does. Submissions listing only your own team, a Photos tab whose page had
not been published yet, the landing hero's 404, a Join button that swallowed
every refusal — none of those look wrong in a diff.

Two assertion traps worth remembering, both the same shape: collapsed
`<details>` (earlier submission versions) and the collapsible sidebar keep
copies of the exact strings being asserted OFF-SCREEN, so `.first()` lands on a
hidden node. `helpers/recipe.ts` has a `visibleText` helper now — "the page
shows X" has to mean someone can see it.

And when an assertion fails on text you can see in the screenshot, do not
theorise: an accessibility tree merges adjacent text and cannot answer "is this
string its own element", which is exactly what an exact-text assertion turns on.
Print `main.innerText()` on failure and the answer arrives in one run.

Run them in slices with `--timeout=15000`: against moved selectors a full run
spends 60s per failing test and takes over half an hour to tell you what a
two-minute slice would.

**The recipe remap turned out to be small.** 213 of its 268 actions drive gRPC
methods directly and do not care what the UI looks like; only 27 carry UI
`steps`. Of those, three addressed the account menu and are re-specified
(`act6.flow.day1end`, `act8.menu.alice`, `act8.menu.admin`) — sign-out and the
account link are top-bar controls now, and `/manage/pages` is reached from the
dashboard. The rest address routes that still exist.

Two of those actions were pinning real gaps rather than describing the UI, and
the fix was in the app: `act2.join.charles` expects Join to land on
`/register/`, and `act8.form.ui.edit` expects the overview to link to your
answers. Both links had been lost in the swap.
