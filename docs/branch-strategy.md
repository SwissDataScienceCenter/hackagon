# Branch strategy: one trunk

**Status:** proposal, for decision. Written 2026-08-19 against `origin/main`
`32bfdd11` and `origin/develop` `fb221076`. Every count came from a command that
can be re-run; anything not verifiable from source is marked as needing
reproduction. No branch was modified to produce this.

Companions: [roadmap.md](roadmap.md) is the product view, [TODO.md](TODO.md) the
engineering list, [testing.md](testing.md) the coverage record.

## 1. The decision

|               | **A — keep them apart** (current plan)         | **B — one trunk** (this proposal)    |
| ------------- | ---------------------------------------------- | ------------------------------------ |
| `develop`     | experimental branch for eliciting requirements | becomes the trunk                    |
| `main`        | frozen, receives requirements later            | becomes an archive tag               |
| Bug fixes     | applied to `develop`, discarded at port time   | applied once, kept                   |
| Deferred cost | re-implement the requirements on `main`        | harvest ~12 screens from the archive |
| **Cost**      | **6–10 person-weeks before parity**            | **≈ 6 days to a stable demo**        |

**The ask is one sentence: agree that `develop` is the trunk and the old `main`
is an archive tag.** Everything else follows and can be scheduled at whatever
pace the budget allows.

Both plans time-box. The disagreement is not about discipline — it is about
which plan contains a large, unscheduled re-implementation. Only one does.

## 2. What the branches contain

They forked on **3 August** and have never met: `develop` has not merged `main`
once. **168 of main's commits are unique patches** develop does not have.

| Measure                 | `main` |  `develop` | Reading                                             |
| ----------------------- | -----: | ---------: | --------------------------------------------------- |
| Last substantive commit | 11 Aug | **17 Aug** | main has had 3 chores and a licence file since      |
| RPCs the other lacks    |  **0** |     **36** | develop's API is a strict superset                  |
| Backend services        |      8 |     **20** | storage, invites, forms, prizes, site pages, config |
| Go test files           |     12 |     **32** | plus a mutation manifest proving they can fail      |
| Frontend unit tests     |     21 |     **29** |                                                     |
| Helm chart files        |  **0** |     **20** | **`main` cannot be deployed at all**                |
| Frontend routes         |     38 |     **44** | 12 only on main, 18 only on develop                 |
| Unguarded mutations     |      — |      **0** | audited handler by handler, §3                      |

`main` is not a clean base awaiting requirements. It took **237 commits** after
the fork from four authors — a second vote service, a different state model, an
RBAC change, a different manage IA — then stopped moving.

**They cannot be merged.** A trial merge gives **137 conflicts, 80 of them
`add/add`** — the same file invented on both sides: the whole vote service
(proto, schema, handler), the capability model, the markdown editor and
sanitiser, the sidebar, the theme, most manage screens. Not two versions of a
file; two implementations of a feature, which no merge tool can adjudicate.

```bash
git merge-tree --write-tree --name-only origin/develop origin/main   # 137 conflicts
git rev-list --count $(git merge-base origin/main origin/develop)..origin/main   # 237
```

**Nor can main's fixes be cherry-picked.** One case stands for the rest: a
reported bug — _hackathons you own do not appear on your dashboard_ — was fixed
on **both** branches, in the **frontend** on `main` (a new `membership.ts`, 86
lines + 80 of tests) and in the **backend** on `develop` (`Create` now writes
the creator's participant row, `hackathon_service.go:164`). Each patches an
implementation the other does not have. There are **36 such `fix(frontend)`
commits on `main`**, each needing to be re-derived as a behaviour by hand.

## 3. Security review of `develop`

Our safety model is that the frontend may be written fast because the gRPC
backend refuses anything it should not permit. This was audited directly, not
inferred from how the code was written.

| Finding                    | Count | Detail                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unguarded mutations**    | **0** | Every `Create/Edit/Delete/Set/Add/Remove/Approve/Submit/Propose/Join` handler enforces before it writes. Six that looked bare on a pattern scan route through helpers (`ownerTarget`, `requireOrganizer`, `setApproval`, `resolveRegistrationTarget`) that each call `RequirePermission` — checked individually, not by pattern. |
| **Unsanitised HTML sinks** | **0** | Both `{@html}` sites are fed by the DOMPurify pipeline in `lib/utils/markdown.ts`; a mutation test proves a script tag cannot survive it. `image/svg+xml` is excluded from uploads on purpose.                                                                                                                                   |
| **Loose typing**           | **0** | Not one `: any` in either frontend's hand-written source. The gRPC clients are generated from the proto contract.                                                                                                                                                                                                                |
| Routes leaking a raw 500   |     5 | Of 37 route files calling gRPC, 5 never catch `ClientError`. Direct cause of three reported bugs.                                                                                                                                                                                                                                |
| Silent empty-list catches  |     2 | A failed call renders as an empty page. The identical bug was found and fixed once on the browse page; two were missed.                                                                                                                                                                                                          |
| Auth redirect loop         |     1 | `hooks.server.ts:181` redirects to login on a refresh failure without clearing the failed session. Unrecoverable without deleting cookies.                                                                                                                                                                                       |

**The safeguard held.** Every 500 in the test feedback was the backend correctly
refusing and the frontend failing to say so in words — the model working as
designed with a reporting gap on top, not an authorisation failure. On the
evidence in the tree, `develop`'s backend is the better-guarded and
better-tested of the two.

**Not verified, and not claimed:** this was a source review. The Go suite was
not run, no penetration test was performed, and the deployed cluster's secrets,
ingress and TLS were not examined. Test counts are not an audit. A real
assurance statement before an external event is a separate half-day with the
stack running.

## 4. Test feedback, triaged

Twelve bugs from the test round, checked against source. The last column decides
the branch question.

| Reported                                                           | Root cause                                                                                        | Layer            | On `main`?                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------- |
| Cannot reach dashboard or profile                                  | refresh-error redirect loop                                                                       | frontend         | different auth code               |
| Ballot does not land; page states two opposite things about voting | two gates (`settings.VotingEnabled` **and** the `Vote` capability) rendered as separate sentences | frontend         | **no** — no capability model      |
| Voting rules reset on save                                         | not reproducible statically                                                                       | unknown          | **no** — develop-only RPC         |
| Propose control offered when closed, then 500                      | backend refuses correctly; frontend neither hides nor translates                                  | frontend         | partial, different gate           |
| 500 on "request a place" after registering via invite              | first-login user-row race                                                                         | frontend         | **no** — invites are develop-only |
| Teams: "More information" errors, edit icon inert                  | one of the 5 untranslated routes                                                                  | frontend         | different teams UI                |
| 404 on View when no registration form                              | `register/[id]/+page.server.ts:50`; control not hidden                                            | frontend         | **no** — forms are develop-only   |
| Cannot remove a project preference                                 | `RemovePreference` exists and is generated; no caller                                             | frontend         | RPC on both                       |
| Waitlisted counted as participants                                 | count uses list length, not confirmed count                                                       | frontend         | **no** — waitlist is develop-only |
| Cannot reject a registration                                       | `RemoveParticipant` exists; no Reject control                                                     | frontend         | **no**                            |
| Cannot reject a project                                            | **schema gap** — status enum is `proposed \| approved` only                                       | backend + schema | same gap on both                  |
| Phase created twice after an error                                 | non-idempotent create on retry                                                                    | frontend         | different phase UI                |

**Eleven of twelve are frontend wiring. One is a genuine schema gap. None is an
authorisation failure.** Most cost an hour or two each.

**Six sit on features `main` does not have at all** — registration forms,
invitations, the waitlist, capability-gated voting, the voting policy. They
cannot be fixed on `main`, and they cannot be described to someone working on
`main` either: the description would be a specification for software that does
not exist yet.

## 5. Why the current plan costs more

Each claim carries the check that would disprove it.

**1. `main` was not left untouched.** 237 commits after the fork, including a
second vote service and a different state model, stopped eight days ago. It is a
divergent, undeployable second implementation. → _Disprove:_
`git rev-list --count $(git merge-base origin/main origin/develop)..origin/main`
returns near zero.

**2. The requirements cannot travel without the code.** What was learned is not
sketches — it is **36 RPCs, 8 database entities and a casbin policy model**.
"Transfer the requirements" means re-implementing registration forms,
invitations, deadline windows, prizes, site pages, object storage, email
templates and the capability system, then re-testing all of it. → _Disprove:_
name three of the 36 develop-only RPCs rebuildable on `main` in under a day
each.

**3. The port gets more expensive every day, never less.** 137 conflicting files
today, 80 of them the same feature written twice, and both branches still
moving. Waiting for requirements to settle does not slow the divergence — it
_is_ the divergence. → _Disprove:_ re-run the trial merge in two weeks; if the
conflict count has fallen, deferring is working.

**4. The plan makes every bug fix necessary and worthless at once.** Testing
happens on a deployed instance, and it is the only one we have — `main` has no
Helm chart. Every bug above must be fixed on `develop` for a demo to work, and
each fix is code we have already agreed to discard. We would pay for the same
work twice by design. → _Disprove:_ show a deployment path for `main`.

**5. Outsourcing is the strongest argument against this plan.** An external
company works from a written specification — that is what the contract is priced
and accepted against. Path A asks them to rebuild 36 RPCs from a description of
a branch we intend to delete: no acceptance criteria, no reference deployment,
and a base with a third of the tests. That is the most expensive contract shape
there is, and the schedule risk lands on us.

Path B hands them the opposite, and all of it already exists: a **deployed
system**, an **end-to-end recipe** covering the full lifecycle, a
**mutation-testing manifest** that proves the tests can fail, and **12,062 lines
of backend tests**. That is an acceptance-criteria package. We should be buying
work measured against it, not paying someone to reconstruct it. → _Disprove:_
draft the statement of work for Path A. If it can be written without pointing at
`develop`, the requirements really are portable.

### What is right about the current plan

The requirements genuinely were unclear, and putting a running product in front
of the organisers was the correct way to resolve that — the feedback is
specific, opinionated and immediately actionable in a way a requirements
workshop would not have produced. Protecting the time budget is the right
instinct. Nothing above disputes either point.

This proposal disputes exactly one claim: that keeping the branches apart is the
_cheaper_ way to honour that budget.

## 6. What each path costs

Estimates derive from measured surface, not from having done the work. They
assume a developer familiar with the codebase; **add 1.5× for an external
team**, plus onboarding.

### Path A — port `develop`'s work onto `main`

| Item                                                     | Measured size                            |           Est. |
| -------------------------------------------------------- | ---------------------------------------- | -------------: |
| 36 RPC handlers with enforcement                         | 3,327 lines of develop-only service code |        18–36 d |
| Supporting packages (audit, storage, capability, config) | 3,088 lines                              |         8–15 d |
| 8 database entities + migrations + ent regeneration      | 638 lines of schema                      |          4–8 d |
| 88 develop-only proto files                              | contract + codegen                       |          3–5 d |
| 18 develop-only frontend routes                          | 3,735 lines                              |        10–18 d |
| Re-establish the test suite                              | 12,062 lines / 32 files                  |         8–15 d |
| Reconcile 80 `add/add` conflicts                         | two implementations of one feature       |         5–10 d |
|                                                          |                                          | **≈ 56–107 d** |

**6–10 person-weeks before `main` can do what the test instance does today** —
before any reported bug is fixed, because they live in the code being ported.

### Path B — promote `develop`, harvest the archive

| Phase | Item                                                      |                                                 Est. |
| ----- | --------------------------------------------------------- | ---------------------------------------------------: |
| 0     | Stop the divergence (tag, CI, agreement)                  |                                            **0.5 d** |
| 1     | Stabilise against the test feedback (12 tickets)          |                                            **5–7 d** |
| 2     | Decide the product/UX feedback (one meeting, then scoped) |                                     0.25 d to decide |
| 3     | Harvest the archive's 12 voting screens (~2,700 lines)    |                                 5–10 d, **optional** |
|       |                                                           | **≈ 6 d to a stable demo; ≈ 3 weeks to parity-plus** |

The two are not close. Path B reaches a demoable product in about a week and
treats the harvest as an optional follow-up. Path A spends two to three months
reaching the position `develop` is in today.

## 7. The plan

### Phase 0 — stop the divergence · **0.5 d**

- Tag `main` as `archive/main-2026-08-18` — nothing lost, history citable. _(15
  min)_
- Point CI at `develop`. Today `ci.yml` triggers on pull requests and push to
  `main`, so **the branch we deploy has no push-CI at all.** _(15 min)_
- Agree no new feature work starts on `main`. _(the decision itself)_

### Phase 1 — stabilise · **5–7 person-days**

One developer: about a week and a half. Two in parallel: about four days — the
tickets are largely independent.

| #       | Ticket                                                                                                                                                                                                                                                                                                                                                                             |    Est. |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: |
| **H-1** | **Signing in can leave an account permanently unusable.** On refresh-token failure the guard redirects to login without clearing the failed session, so the next request fails identically — `ERR_TOO_MANY_REDIRECTS`, unrecoverable without deleting cookies. Clear the session first; add a loop-breaker landing on a signed-out page with an explanation. `hooks.server.ts:181` |   0.5 d |
| **H-2** | **Ballots do not land, and the page contradicts itself.** `SubmitVote` requires _both_ `settings.VotingEnabled` and the `Vote` capability; the page renders those as separate sentences, so a voter is told voting is open and closed at once. Derive one state from both gates; surface the refusal when a cast fails. `voting/+page.svelte:69,71`                                |   0.5 d |
| **H-3** | **Voting rules revert to defaults after Save.** The round trip reads correct statically — **reproduce against the deployed instance first** and capture the stored JSON. Likely: the policy row not re-read after the action, or the entity not reloading before re-render. `voting/+page.server.ts:371,438` · `config_service.go:669`                                             | 0.5–1 d |
| **H-4** | **Five routes turn a backend refusal into a raw 500.** Of 37 route files calling gRPC, five never catch `ClientError`. One fix closes three reported bugs — apply the translation block used by the other 32.                                                                                                                                                                      |   0.5 d |
| **H-5** | **Controls offered for actions the backend will refuse.** "Propose a project" renders when the capability is closed; "View" renders with no registration form and lands on a 404. The backend is right to refuse — stop offering the control. `register/[id]/+page.server.ts:50`                                                                                                   |   0.5 d |
| **H-6** | **500 on "request a place" right after registering through an invite.** Works on reload, pointing at the platform user row not existing yet on the first authenticated request. Make the join path tolerate a not-yet-synced user.                                                                                                                                                 |   0.5 d |
| **M-1** | **Waitlisted people counted as participants.** The card says "2 participants" where one is confirmed. Count confirmed for the headline; show waiting separately.                                                                                                                                                                                                                   |  0.25 d |
| **M-2** | **No way to remove a project preference.** `RemovePreference` exists in the proto and generated client with zero callers. Add the control; no backend work.                                                                                                                                                                                                                        |  0.25 d |
| **M-3** | **No way to reject a registration request.** `RemoveParticipant` already does the right thing to a waiting participant. Add a Reject action with confirmation.                                                                                                                                                                                                                     |  0.25 d |
| **M-4** | **A project can be approved but never rejected.** The only real schema gap: `Project.status` is `proposed \| approved`. Needs an enum value, migration, a `Reject` RPC (`setApproval` already takes a status) and the control. Self-cancel can use the existing `Delete`. `db/schema/project.go:38`                                                                                |     1 d |
| **M-5** | **A failed phase creation can still create the phase.** Return the created id; make the form idempotent on resubmit.                                                                                                                                                                                                                                                               |   0.5 d |
| **M-6** | **Two pages still render an outage as "nothing here."** Not in the test feedback — which is why a feedback list alone is not a plan. A failed call is replaced with an empty array, so "backend unreachable" and "nothing to show" render identically. Already fixed once on the browse page.                                                                                      |  0.25 d |
| **M-7** | **CI does not run on the branch we deploy.** One line in `ci.yml`.                                                                                                                                                                                                                                                                                                                 |   0.1 d |

### Phase 2 — decide the product feedback · one meeting, then scoped separately

The landing-page consolidation, folding Dashboard and All Hackathons into one
list, the light-mode default, the partner logos and the contact call-to-action
are **product decisions, not bugs**. They are exactly the requirements the
experiment was run to surface and deserve their own scoping. Mixing them into a
stabilisation sprint is how a one-week sprint becomes three. This is where the
original instinct was right and should be preserved.

### Phase 3 — harvest, then retire the fork · **5–10 d, optional**

The archive's one real asset is its voting-management UI: 12 routes, ~2,700
lines, including per-category results and a richer team detail page. Port those
forward as features against the current contract. Then rename `develop` to
`main` and delete the fork. One trunk, one deployment, one place bugs get fixed.
