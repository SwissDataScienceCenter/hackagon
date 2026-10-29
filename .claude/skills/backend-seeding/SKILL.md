---
name: backend-seeding
description:
  Adapting the Hackagon dev seed fixture (components/backend/cmd/seed) — adding
  or changing hackathons, users, projects, teams, submissions, phases and votes
  through the in-process gRPC harness, the step helpers in steps.go,
  capabilities that must be on when they are used, synthetic users who cannot
  log in, idempotency and re-seeding (locally and on the dev cluster), and how
  to verify a change without wiping local state. Use when asked to add or change
  dev/test data, make a scenario reproducible locally, pick which seeded
  hackathon to test something in, or fix a seeded hackathon nobody can act in.
---

# Adapting the seed

`components/backend/cmd/seed` builds the dev fixture by **calling the real gRPC
handlers**, not by writing rows. What is in the fixture — which hackathon is
frozen in which phase, who can sign in, which one to test what in, and when it
needs re-seeding — is documented in `components/backend/cmd/seed/README.md`.
Read its first sections before changing anything; this skill is how to change
it, not what it contains.

## How it works

[harness.go](../../../components/backend/cmd/seed/harness.go) stands the actual
server up in-process on an in-memory pipe — protovalidate and the auth
interceptor included — and signs its own JWTs with a throwaway key the server
trusts for that run. So the seed can act as any identity, including the ones
with no Keycloak account, and needs neither the stack nor Keycloak running. Its
header comment says why calling handler functions directly would not do.

Consequences that shape every change:

- **The rows are whatever the handlers write.** Casbin roles come from the
  handlers too: `Join` + `ApproveParticipant` grants `Member`, `Propose` grants
  the project-scoped `Owner`, `AssignUser` grants the team-scoped `Member`.
  **Never write casbin rows or ent rows by hand** — that is the drift this
  design removed. The one exception is registration answers, stored directly
  while `SubmitAnswers` is broken (see `submitAnswers` in steps.go).
- **A move the API refuses, the seed cannot make.** If a step fails with
  `PermissionDenied` or `InvalidArgument`, the fixture is asking for a state the
  application could not produce — fix the fixture, not the handler.
- **Not atomic.** Several handlers open their own transaction, so a run that
  dies partway leaves some hackathons behind. `main.go` detects that rather than
  preventing it.

## Shape of the package

```
main.go     users, then seedH1 … seedH6 in order; the hackathon-name list
            that makes a re-run a no-op
harness.go  the in-process server and token minting
actors.go   register (a user, as themselves), makeOrganizer
steps.go    the moves a hackathon is built from — setCaps, joinAndApprove,
            createPhases, proposeProjects, createTeams, createSubmissions,
            createVoteCategory, submit*Vote, createVoteResult, …
h1.go … h6.go   one hackathon each, top comment says what it is for
            and what is deliberately absent
```

## Adding to the fixture

Build from the helpers in `steps.go`; add one there when a move is needed twice.
Match the existing style: spec structs filled in completely (the `exhaustruct`
linter runs on this package, so unset fields are written out as `nil` / `0` /
`""`), errors wrapped with what failed (`fmt.Errorf("team %q: %w", name, err)`),
and a comment on anything deliberate that looks like a mistake.

**Capabilities must be on at the moment they are used.** Joining needs
`register`, proposing needs `propose projects`, submitting needs
`project submissions`, voting needs `vote`. So each hackathon calls `setCaps`
early with everything its history needs, and ends with a second `setCaps`
declaring the state it is left in. `setCaps` always states all capabilities, so
each call is a declaration rather than a patch. Voting also needs `view teams`
on — the voting page builds the ballot from the teams.

**Order matters** in ways the handlers enforce:

- Signups before the registration form, if anyone is meant to have answered
  nothing — `Join` refuses to skip a mandatory question.
- Approval before proposing — proposing needs `Member`.
- Teams are created and staffed by an owner — no participant can do it.
- A past hackathon is built with a live window and moved back last with
  `backdate`, because `Join` refuses a hackathon that has ended.
- A private hackathon is joined with an invite: `createInvite` then
  `joinAndApproveWithInvite`.

**Voting rules the handler enforces:** nobody can vote on their own team's
submission; a jury category refuses anyone off its roster; a points category
needs `maxPoints`, and a points vote cannot be changed — cast each voter's whole
ballot in one `submitPointsVote`.

**Timestamps are always relative** to `now` (`now.AddDate(0, 0, 5)`), never
literal dates, so a fresh seed puts each hackathon back where it belongs.

**Randomness comes from a constant seed** (`rand.New(rand.NewSource(…))`), never
the clock, so re-seeding reproduces the same fixture. Give each new random
stream its own constant, so adding draws cannot shift existing ones.

### Users

The four that can sign in — `hackagon-admin`, `alice`, `bob`, `charles` — exist
in the Keycloak dev realm (`tools/configs/keycloak/realm-hackagon.json`) with
matching IDs in `main.go`. Anyone else is created with `h.register` and a
`seed-…` Keycloak ID and **cannot log in** (dana, yuki, H4's hundred, H6's
thirty). That is the right choice for bulk; add a Keycloak user only when a
person has to drive the UI as them.

Conventions worth keeping: `hackagon-admin` takes part in nothing (so the
global-admin escape hatch is tested from outside); no owner takes part in the
hackathon they run; leave a login-able account untouched wherever a flow needs
somebody to try it fresh (bob and charles have no votes in H6 and are not in
H5).

### A new hackathon

Add its name to the constants and `seededHackathonNames()` in `main.go`, write
`hN.go`, call it from `seedAll`. Every existing database then holds a _partial_
set and `just db::seed` stops with `partial seed data found` — that is by
design, and the README's **When to re-seed** section says so; existing databases
need `just clean::state`.

## Verifying a change

Build and lint inside the Nix shell (the system Go is too old for this repo):

```bash
just nix::develop default bash -c 'cd components/backend && go build -o /dev/null ./cmd/seed/ && \
  golangci-lint run --config ../../tools/configs/golangci-lint/golangci.yaml ./cmd/seed/...'
```

Run it **without wiping local state** by seeding a throwaway database next to
`hackagon` — `HACKAGON_DATABASE_DBNAME` overrides the config. Put the whole
cycle in one script and run it with one call; querying the result with `psql` is
cheaper than going through the API:

```bash
psql -h 127.0.0.1 -U postgres -d postgres -c 'CREATE DATABASE hackagon_seedtest'
cd components/backend && HACKAGON_DATABASE_DBNAME=hackagon_seedtest \
  go run ./cmd/seed/ --config-dir ./data/test/config/       # run twice: 2nd must skip
psql -h 127.0.0.1 -U postgres -d hackagon_seedtest -c '…'   # check what you added
psql -h 127.0.0.1 -U postgres -d postgres -c 'DROP DATABASE hackagon_seedtest'
```

Table and column names are ent's (`team_submissions`, `vote_category_votes`, …);
read them from `ent/migrate/schema.go` with grep rather than guessing.

To use the new fixture locally for real: `just fresh` — it wipes state, starts,
seeds, then **restarts the backend**, which matters: the running server loaded
its casbin policy before the seed wrote any, and until it restarts, owners are
refused their own hackathons. Seeding by hand means that restart
(`just deploy::down && just deploy::up`) is yours to do.

On the dev cluster, `just cluster::reseed <context>` backs up, wipes the app
database, seeds from your checkout and restarts the backend. It refuses unless
`components/backend` matches `origin/main`, so it runs after merging.

## After changing the seed

Update `cmd/seed/README.md` in the same commit: the at-a-glance tables, the
**Which hackathon for which test** table if a test moved, and the hackathon's
own section. When the seed is the cause of a stale number elsewhere (a count in
a comment, an identity total in `harness.go`), fix it too. Seed data is not
user-visible, so it needs no `CHANGELOG.md` entry.
