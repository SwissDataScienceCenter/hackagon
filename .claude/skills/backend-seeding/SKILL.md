---
name: backend-seeding
description:
  Adapting the Hackagon dev seed fixture (components/backend/cmd/seed) — adding
  or changing hackathons, users, projects, teams, submissions and phases, the
  casbin roles that must accompany every DB row, the sentinel-based idempotency
  and how to force a re-seed, and the HackathonState plus casbin rows that
  decide what participants may actually do in each seeded hackathon. Use when
  asked to add or change dev/test data, make a scenario reproducible locally, or
  fix a seeded hackathon that nobody can act in.
---

# Adapting the seed

`components/backend/cmd/seed/main.go` (~880 lines) builds the dev fixture
directly through ent — it does **not** go through the gRPC handlers. That's why
it can produce states the API never would, and why it can equally produce
_broken_ states the API never would. See the trap below.

Run it with `just db::seed`. The fixture itself is documented in
`components/backend/cmd/seed/README.md` — three hackathons (upcoming public,
ongoing public, past private), four users, teams, submissions and a waitlisted
participant, all with timestamps relative to `time.Now()` so re-seeding keeps
the ongoing one ongoing.

## Shape of the file

```
main()          flags, config, ent.Open, schema migrate,
                sentinel check, grant alice the global HackathonOrganizer role
  └ seed()      wraps everything in one transaction
      └ withTx()      commit on success, rollback on error, rollback+re-panic on panic
          └ seedInTx()    getOrCreateUser × 4, then:
              ├ seedH1()  AI Innovation Challenge 2026 — upcoming, public,  alice owns
              ├ seedH2()  Climate Tech Hackathon 2026  — ongoing,  public,  admin owns
              └ seedH3()  Internal Product Sprint      — past,     private, admin owns
```

Everything is one transaction: a failure anywhere leaves the DB untouched.

## Idempotency and re-seeding

`sentinelHackathon = "AI Innovation Challenge 2026"`. If a hackathon with that
name exists, `main` logs `seed data already present, skipping` and exits 0.

**Consequence: editing the seed and re-running does nothing.** To pick up
changes you must clear state first:

```bash
just clean::state    # wipes postgres + keycloak state
just start
just db::seed
```

If you rename H1, you rename the sentinel — update the constant to match or the
guard stops working.

## The trap: DB rows and casbin roles are separate writes

Permissions do **not** come from the database. A `Participant` row makes someone
a participant in the data; it does not give them any permission. The casbin role
is a second, independent write, and the seed does both by hand:

```go
// DB: who is in the hackathon (and whether they're waitlisted)
db.Participant.Create().SetHackathon(h).SetUser(u).SetIsWaiting(false).Save(ctx)

// casbin: what they may do — a SEPARATE write, easy to forget
enf.AddRole(u.KeycloakID, middleware.Owner, h.ID.String())
```

Note `AddRole` takes the **Keycloak ID**, not the DB UUID — the JWT `sub` is the
casbin subject.

Scoped variants exist for sub-resources:

```go
enf.AddRole(u.KeycloakID, middleware.Owner,  h.ID.String(), middleware.WithProject(p.ID.String()))
enf.AddRole(u.KeycloakID, middleware.Member, h.ID.String(), middleware.WithTeam(t.ID.String()))
```

**If you add a participant and forget the role, they exist but can do nothing**
— and it looks exactly like a handler bug. The existing code pairs them
consistently: project creation is always followed by an `Owner` grant scoped to
that project; team membership by a `Member` grant scoped to that team. Follow
the pairing.

Deliberate exception worth preserving: `charles` is waitlisted in H1
(`SetIsWaiting(true)`) and gets **no** casbin role. He's the fixture for testing
refusals — don't "fix" him.

## Adding to the fixture

Match the surrounding style: build entities with ent's fluent API, wrap each
error with context (`fmt.Errorf("team Alpha: %w", err)`), and use table-driven
loops for repetitive rows:

```go
for _, p := range []struct {
    u         *ent.User
    isWaiting bool
}{
    {admin, false},
    {alice, false},
    {charles, true},
} {
    if _, err := db.Participant.Create().
        SetHackathon(h).SetUser(p.u).SetIsWaiting(p.isWaiting).Save(ctx); err != nil {
        return fmt.Errorf("participant %s: %w", p.u.Username, err)
    }
}
```

Timestamps are always **relative** — `now.AddDate(0, 0, 19)`, not a literal date
— so the fixture keeps its past/ongoing/upcoming shape whenever it's run. Keep
it that way.

New users need a Keycloak ID that matches the dev realm. The three non-admin IDs
are hardcoded constants at the top of the file; the admin's comes from config.
Adding a genuinely new user means adding them to Keycloak too
(`tools/configs/keycloak/`), not just here.

## Capabilities: every hackathon needs `seedCapabilities`

A capability is **two writes, not one**: the boolean on `HackathonState` and a
casbin policy row. The enforcer only ever reads the policy, so a state row on
its own grants nothing and a hackathon without both is one nobody can act in —
this used to be the single biggest reason a seeded hackathon felt broken.

`seedCapabilities` (`main.go:67`) does both, and every hackathon must call it.
It copies the role each capability grants to from `SetCapabilities`
(`hackathon_service.go:616-653`) so seeded hackathons behave like ones created
through the API — registration granting to `*` rather than a role, since the
point is that a non-member can join, and `vote` writing **two** rows
(`Vote:Create` plus `VoteCategory:Read`, without which a member cannot see what
there is to vote on). It also takes the phase an organizer has declared current,
or nil.

One row goes **beyond** the handler on purpose: team preferences are granted to
`Owner` as well as `Member`. The handler grants `Member` only and the model has
no inheritance, so an owner cannot express a preference — judged wrong and
tracked in `mydocs/docs/backend-tickets/project-preferences-capability.md`
(which also documents a partial-write bug in `SetCapabilities` when the state
row is missing). Drop that row if you would rather the fixture mirror the
handler exactly.

The sets are chosen per hackathon so the fixture spans the interesting states:

| Hackathon               | On                                          | Current phase |
| ----------------------- | ------------------------------------------- | ------------- |
| AI Innovation 2026      | register, propose, preferences, submissions | none          |
| Climate Tech 2026       | propose, preferences, submissions           | Hacking       |
| Internal Product Sprint | vote, view-results                          | Demo          |

So "capability-gated mutation refuses" is now a question about _which_
hackathon, not about the seed as a whole. Phase tags stay decorative: a phase
tagged `vote` in a hackathon whose `voting_enabled` is false is a legitimate
fixture — it says when voting is meant to happen, not that it is open.

## After changing the seed

- Update `components/backend/cmd/seed/README.md` — it documents the fixture in
  detail (user table, hackathon table, timeline, per-hackathon sections) and is
  the thing people read instead of the Go file.
- Re-seed from clean state and verify over the wire with the
  **backend-api-explore** skill, e.g.
  `just rpc::as alice aliceandbob hackathon.HackathonService/List '{}'`.

Chain the re-seed and its verification into **one** tool call — a
wipe/seed/check cycle run as separate calls re-bills the whole context window
each time (see the context budget in `CLAUDE.md`), and the intermediate output
tells you nothing:

```bash
just clean::state && just db::seed && just db::summary && \
  just rpc::as alice aliceandbob hackathon.HackathonService/List '{}' \
    | jq -r '.hackathons[] | "\(.id)  \(.name)"'
```

Reach for `jq` to project just the fields you're checking rather than letting a
full `Get` tree — which returns projects, tracks, pages, phases and members —
land in the window whole.
