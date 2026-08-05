# User flows

What the platform looks like to each kind of person who uses it, screen by
screen, on a desktop and on a phone.

Every image is a real screenshot of the running application, captured against
the seed fixture (`just db::seed`) — the same fixture the e2e suite asserts
against, built for this purpose: an upcoming, an ongoing and a past hackathon,
public and private, with teams, draft/final submissions and a waitlisted
person. Dates slide with the seed run, so they will not match yours exactly.

Cast (dev password `aliceandbob` for everyone):

| Person | Sees the platform as |
| --- | --- |
| — | An anonymous visitor who has never signed in |
| `bob` | A participant: member of two events, on Team Gamma |
| `alice` | An organizer: created the AI Innovation Challenge |
| `hackagon-admin` | A platform admin: global Admin role |

> **Regenerating.** These are produced by the `hackathon-e2e` skill, not by
> hand:
> `DOCS_SHOTS=1 pnpm exec playwright test --project=docs`
> writes straight into `docs/flows/`. The suite self-skips without
> `DOCS_SHOTS=1`, so a normal test run never rewrites committed images. Theme
> and viewports (1440×900 / 390×844) are pinned in the spec so a re-take
> cannot silently change the whole set.

---

## 1. A visitor discovers an event

No account, no session. Everything here is reachable before signing in — the
auth guard treats public event pages and published platform pages as public,
which is why the footer's About link works for someone who has never logged in.

### 1.1 The landing page

Live and upcoming events, with the one that is running right now called out at
the top. The tab counters ("Live now 1", "Upcoming 1") come from the same
`HackathonService.List` call, filtered client-side.

| Desktop | Phone |
| --- | --- |
| <img src="flows/visitor-1-landing-desktop.webp" alt="Landing page on desktop" width="720"> | <img src="flows/visitor-1-landing-phone.webp" alt="Landing page on a phone" width="220"> |

### 1.2 A public event page

Anyone may read a public event without an account: the dates, the description
and the event's own News & Pages. Private events are not listed here at all,
and a guessed URL returns the same "not found" as a hackathon that does not
exist — the way in is an invitation link (flow 4).

| Desktop | Phone |
| --- | --- |
| <img src="flows/visitor-2-event-desktop.webp" alt="Public event page on desktop" width="720"> | <img src="flows/visitor-2-event-phone.webp" alt="Public event page on a phone" width="220"> |

### 1.3 A platform page

`/about`, `/privacy` and `/terms` are `SitePage` records an admin writes in the
CMS (flow 5) — not files in the repo. Content is markdown, parsed and sanitized
before rendering.

| Desktop | Phone |
| --- | --- |
| <img src="flows/visitor-3-about-desktop.webp" alt="About page on desktop" width="720"> | <img src="flows/visitor-3-about-phone.webp" alt="About page on a phone" width="220"> |

---

## 2. A participant during the event

Signed in as `bob`, a confirmed member of two events.

### 2.1 The dashboard

Everything you are connected to, with your membership shown next to the event's
status: `Active`/`Upcoming`/`Finished` is computed server-side from the dates,
`Member`/`Owner`/`Waitlisted` comes from casbin plus the participant row.

On a phone the row becomes a column and the badges move under the title —
a fixed-height row clipped long event names and collided with the chips.

| Desktop | Phone |
| --- | --- |
| <img src="flows/participant-1-dashboard-desktop.webp" alt="Dashboard on desktop" width="720"> | <img src="flows/participant-1-dashboard-phone.webp" alt="Dashboard on a phone" width="220"> |

### 2.2 The event overview

The member view of one event: phase progress, your participation, and the
event's own pages. Waitlisted people cannot reach this — `HackathonService.Get`
denies them, and the frontend turns that into a 403.

> **Note:** the "Your Participation" card and the proposal counts on this page
> are still placeholder values, not live data. It is on the cleanup list in
> [TODO.md](TODO.md); the screenshot shows the page as it is today rather than
> as it is meant to be.

| Desktop | Phone |
| --- | --- |
| <img src="flows/participant-2-overview-desktop.webp" alt="Event overview on desktop" width="720"> | <img src="flows/participant-2-overview-phone.webp" alt="Event overview on a phone" width="220"> |

### 2.3 Teams

Who is on which team. Team membership is a join table plus casbin rows written
as compensating writes — never inside one transaction, because casbin writes on
its own connection and holding an ent transaction across one deadlocks.

| Desktop | Phone |
| --- | --- |
| <img src="flows/participant-3-teams-desktop.webp" alt="Teams page on desktop" width="720"> | <img src="flows/participant-3-teams-phone.webp" alt="Teams page on a phone" width="220"> |

### 2.4 Submissions

Your teams and what they turned in — version number, `Final` or draft, and the
deadline the backend enforces (organizers can extend it with a now-anchored
override). Only a team's own members may write its submission; reading is
hackathon-wide, which is pinned as policy by the e2e recipe.

| Desktop | Phone |
| --- | --- |
| <img src="flows/participant-4-submissions-desktop.webp" alt="Submissions page on desktop" width="720"> | <img src="flows/participant-4-submissions-phone.webp" alt="Submissions page on a phone" width="220"> |

---

## 3. Your account

### 3.1 The account menu

The avatar opens a menu: who you are signed in as, your events, your account,
and — only for the roles that have them — creating a hackathon and the platform
admin pages. Entries are gated by the backend's own answer (casbin global roles
via `WhoAmI`), and every page behind them enforces independently.

It is a native `<details>`, so it opens on the first click even before the page
has hydrated. The dot marks the page you are already on.

| Desktop | Phone |
| --- | --- |
| <img src="flows/account-1-menu-desktop.webp" alt="Account menu open on desktop" width="720"> | <img src="flows/account-1-menu-phone.webp" alt="Account menu open on a phone" width="220"> |

### 3.2 The account page

Your display name is the platform's own field and is editable here — it is what
appears next to everything you create. Username, email and password belong to
Keycloak and are re-read from your token on every request, so the page links
out to Keycloak's account console instead of offering fields that would revert.

Deleting your profile removes your roster places and roles but not your sign-in
account; content other people depend on blocks the deletion rather than
cascading away.

| Desktop | Phone |
| --- | --- |
| <img src="flows/account-2-account-desktop.webp" alt="Account page on desktop" width="720"> | <img src="flows/account-2-account-phone.webp" alt="Account page on a phone" width="220"> |

---

## 4. An organizer running an event

Signed in as `hackagon-admin`, on the event's own Manage tab. The tab only
appears for people with hackathon `Write`.

### 4.1 The cockpit

One page for the roster, invitation links, the event's pages, phases, windows,
forms, prizes and branding. Invitation links are how a private event is shared:
anyone holding one can see the event and request a place, an organizer still
approves them, and a link that spreads too far can be revoked.

| Desktop | Phone |
| --- | --- |
| <img src="flows/organizer-1-manage-desktop.webp" alt="Organizer cockpit on desktop" width="720"> | <img src="flows/organizer-1-manage-phone.webp" alt="Organizer cockpit on a phone" width="220"> |

### 4.2 Participants

The roster as participants see it, including who is waiting for approval.

| Desktop | Phone |
| --- | --- |
| <img src="flows/organizer-2-participants-desktop.webp" alt="Participants page on desktop" width="720"> | <img src="flows/organizer-2-participants-phone.webp" alt="Participants page on a phone" width="220"> |

---

## 5. A platform admin

Signed in as `hackagon-admin`. These pages need the **global** Admin role — an
event organizer is denied, because they belong to the platform rather than to
any one event.

### 5.1 Pages (About, Privacy…)

The CMS behind the footer links. Pages are markdown, addressed by a unique
slug, and draft pages return "not found" to everyone else so their existence
stays private until published. A published slug is reachable immediately,
without a code change per page.

Every management list shares one toolbar: a quick search, dropdown filters, and
a cards/table toggle whose choice is remembered per list. Here the search covers
the page **content** as well as the title — "where did I write that paragraph"
is the question these pages actually get asked. The table view puts Edit, View
and Delete behind a per-row menu so a row stays one line.

| Desktop | Phone |
| --- | --- |
| <img src="flows/admin-1-pages-desktop.webp" alt="Platform pages CMS on desktop" width="720"> | <img src="flows/admin-1-pages-phone.webp" alt="Platform pages CMS on a phone" width="220"> |

### 5.2 Users

Everyone who has ever signed in. Profiles are created on first login, so this
list grows by itself — which is why it is searchable across name, handle, email
and Keycloak ID, and filterable by global role. There are deliberately no
per-row actions: granting and revoking global roles are proto-only stubs today,
and a button that cannot work is worse than none.

| Desktop | Phone |
| --- | --- |
| <img src="flows/admin-2-users-desktop.webp" alt="User admin on desktop" width="720"> | <img src="flows/admin-2-users-phone.webp" alt="User admin on a phone" width="220"> |

---

## Related

- [lifecycle.md](lifecycle.md) — the same story as a sequence of events and RPCs
- [frontend/routes-and-auth.md](frontend/routes-and-auth.md) — which routes are
  public and how the guard decides
- [testing.md](testing.md) — the suites these screenshots are generated by
