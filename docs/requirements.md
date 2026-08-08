# Requirements — summary

**Derived from the executable spec** `.claude/skills/hackathon-e2e/recipe.jsonl`
(309 actions, one action = one requirement), re-measured 2026-08-08 on branch
`sketch/06-08-26`. This page is the summary; **the canonical, full-detail
requirement list is the recipe itself** — every action carries the requirement
(`title`), the `actor`, the machine-checked acceptance criterion (`outcome`) and
a `priority` (P1–P3). Trace anything by its recipe action id.

**How this page is maintained: by hand.** There is no generator — nothing under
`docs/` or `.claude/skills/` writes this file, and no earlier version of it was
machine-produced either. When the recipe changes, re-measure and edit here. The
counts on this page all come from one command:

```bash
python - <<'EOF'
import json, collections
a = [json.loads(l) for l in
     open(".claude/skills/hackathon-e2e/recipe.jsonl", encoding="utf-8") if l.strip()]
a = [o for o in a if "id" in o]          # the rest are act banners
kind = lambda o: {"rpc": "backend", "files.generate": "infra"}.get(o["action"], "frontend")
print(len(a), collections.Counter(map(kind, a)))
print(collections.Counter(o["act"] for o in a))
print(collections.Counter(o.get("priority") for o in a))
EOF
```

`"id"` is the honest predicate for "this line is an action": act banners are
lines carrying only a `comment`. Filtering on the _absence_ of `comment` instead
is what made `act8.flow.bob` disappear for the whole life of the file — see
[testing.md](testing.md).

**Scoreboard**

| | Count |
| --- | --- |
| Total requirements | **309** |
| Backend (gRPC behavior, enforcement, validation — `rpc`) | 254 |
| Frontend (rendering, navigation, error translation — `ui.assert` + `ui.flow`) | 54 |
| Test infrastructure (deterministic fixtures — `files.generate`) | 1 |
| **Verified** (all of them pass: journey 313/0/0, smoke 80/0) | **309** |
| **Deferred** | **0** — no action carries `implement: false` any more |
| Priority | P1: 215 · P2: 85 · P3: 9 |
| Of which negative (assert a specific error code) | 63 |
| Carrying a `gate` (wake up when their RPC lands) | 24 |
| Carrying a `todo` note | 24 |

Playwright's 313 is 4 auth-setup tests plus all 309 actions; nothing skips.

The availability heatmap in `recipe-player.html` is the live burn-down of this
list — re-splice it after any recipe edit or it silently shows the old file.

## Part I — Backend requirements (254)

| Act | Reqs | What they require |
| --- | --- | --- |
| 0 · Platform setup (before any event) | 10 | The site itself: the admin authors the About page as a draft, publishes it, adds Privacy and Terms. Site pages need the **global** Admin role, so an organizer is refused and an anonymous caller gets `Unauthenticated`. Duplicate and malformed slugs rejected; an unknown slug stays a 404; a `<script>` payload pasted into the markdown is stored but neutralised. |
| 1 · Publication (T-4mo) | 33 | Event create/edit (name, dates, visibility, logo round-trip), the per-event configuration engine (registration & submission forms, consents, voting policy, time windows), prize table, pages & tracks, presigned media upload with size and content-type refused ON the presign, private drafts invisible to outsiders, permission negatives (non-organizers cannot create/edit). |
| 2 · Registration (T-3mo) | 42 | Self-service join → waitlist, schema-validated form responses (unknown fields and missing required consents rejected), correcting an earlier answer (the form is an upsert), reading your own answers back while a fellow member may not, roster monitoring, visibility pause/relist, admin user management, malformed/ghost request handling, join idempotency. |
| 3 · Proposals (T-2mo) | 12 | Proposal lifecycle: propose, edit, withdraw own, organizer approve; anonymous and unauthorized callers rejected; ghost-id handling. |
| 4 · Teams (T-1.5mo) | 28 | Project preferences (today an unordered, add-only set — see [glossary](glossary.md)), preference export, team create/edit/delete, member assignment and rebalancing, every confirmed participant seated, webinar page. |
| 5 · Registration closes (T-1wk) | 39 | Approval up to capacity (idempotent), dropout cascades to team seat, waitlist backfill, closed-window enforcement, access revoked instantly on removal, member-role cannot approve/remove, owner grant/revoke, the read-only `HackathonState` façade, audit snapshots. |
| 6 · Event days (T0/T+1) | 34 | Status flips by dates (time travel), no-show seat cleared but participant retained, same-day walk-in (register → window override → join → approve → team), phases, submissions draft→edit→final with form payloads, deadline enforcement + admin grace override, live announcements, logo refresh. |
| 7 · Voting (T+1) | 37 | Vote categories in all three methods, single-choice / ranked / points ballots with one ballot per voter per category, waitlisted users and organizers cannot vote, double and late votes rejected, close via settings, tally suggestion and results aggregation, **admin prize finalize — votes are advisory**. |
| 8 · Post-event (T+1wk) | 19 | Archive semantics: Finished status, late joins rejected, members keep access, winners/wrap-up publication, gallery uploads, prize edits (admin-only), cleanup deletions, and profile churn — renaming yourself, and a blank rename refused. |

## Part II — Frontend requirements (54)

| Act | Reqs | What they require |
| --- | --- | --- |
| 0 · Platform setup | 5 | The footer About link leads nowhere on a blank platform; the draft stays invisible to the public; once published anyone can read it from the footer; the injected script never executes; all three footer links resolve. |
| 1 · Publication | 9 | Anonymous home lists public events with server-computed status badges; private drafts invisible; browse chains (home → detail → back); abandoned-login and wrong-password-recovery flows; the signed-in non-member click path. |
| 2 · Registration | 9 | Dashboard shows Waitlisted badges and correct counts; member view returns 403 while waitlisted; fresh-login chains; the admin user-management page shows registrants; the non-admin `/manage/users` behavior. |
| 3 · Proposals | 1 | The projects page shows approved and pending side by side, with status badges. |
| 4 · Teams | 1 | Teams page lists each team with exactly its expected members. |
| 5 · Registration closes | 9 | Badges flip to Member; member view opens (200) with the real About text; member tour and admin escape-hatch navigation chains; waitlisted user still sees 403; participant-search form flow. |
| 6 · Event days | 8 | Public site shows Active; day-boundary sign-out/return chains; announcement text visible to members; timeline shows phases in order; day-1 teams page reflects no-show/walk-in reality. |
| 7 · Voting | 0 | Act 7 is entirely API-side; the voting screens are exercised by the smoke suite instead. |
| 8 · Post-event | 12 | Finished badge; archive browse chains for members and the still-locked-out waitlisted user; winners page and wrap-up blog readable by anonymous visitors; members retain history (Submissions/Photos tabs). |

## Part III — Test infrastructure (1)

Act 6: the deterministic upload-fixture bundle (PNG/SVG/PDF/CSV/README),
byte-stable across runs — the payload the real media-upload actions consume.

## Nothing is deferred

`implement: false` used to mark six actions built as documentation only (email
templates, branding, submission-form validation, GDPR account deletion). All of
them were built; **no action in the recipe sets the field any more**, and the
journey runs with zero skips. An action that cannot run yet is expressed as a
`gate` instead, which is probed at runtime so it starts running by itself the
day its RPC lands.

## Housekeeping

24 actions still carry a `todo` note, and a `todo` is only a placeholder: it is
printed as the skip reason when the action's gate is closed, so on a fully green
run it is dead text. Prune the notes on actions that now pass on every run
(`act1.page.welcome`, `act1.track.ds`, `act4.export`, `act8.photos`,
`act8.blog`, and the rest of the list the command at the top of this page
prints). Do **not** prune the `gate` fields — those are load-bearing, and
`runRpc` fails loudly if a gate names an RPC `scripts/probe.sh` never probes.

## See also

- [lifecycle.md](lifecycle.md) — the same acts told as a story, with the policy
  decisions each requirement pins.
- [testing.md](testing.md) — how the recipe these requirements come from is run.
- [TODO.md](TODO.md) — the requirements that are not met yet.
- [roadmap.md](roadmap.md) — which of them are MVP and which are Core.
