# The RPC journal

A development and analysis tool. When it is on, the backend appends one JSON
line per gRPC call to a local file, in the shape
`.claude/skills/hackathon-e2e/recipe.jsonl` already uses — so lifecycle test
actions can be derived from what people actually do instead of guessed.

**It is off by default and must be turned on deliberately.**

Code: `components/backend/internal/audit/`. Configuration: `config.AuditConfig`.

## Why a backend interceptor and not a browser SDK

Session-replay products (OpenReplay and friends) record the browser. That is the
wrong layer here: the frontend's gRPC clients live in
`components/frontend/src/lib/server/grpc/client.ts` and run **server-side**,
inside SvelteKit `load` functions and form actions. There is no browser-side
gRPC at all. A browser SDK would record "clicked Save" and never see
`hackathon.HackathonService/Edit`.

The reverse is also true, which is why both exist: this journal cannot see a
click that produces **no** RPC, and that absence is a whole bug class of its
own. Session replay covers it —
[`frontend/session-replay.md`](../frontend/session-replay.md) — under a separate
consent, and the two are deliberately **impossible to join**: no replay or
session identifier exists anywhere in this backend, and no line here carries
one.

Every RPC in the system passes through one chokepoint — `grpc.UnaryInterceptor`
in `internal/service/server.go` — and that chokepoint already has everything a
recipe action needs: the JWT subject the auth interceptor put in the context,
`info.FullMethod`, the request message, and the error the handler returned.

## What is recorded

One line per unary RPC that reaches a handler:

| Field      | Contents                                                                       |
| ---------- | ------------------------------------------------------------------------------ |
| `seq`      | Monotonic, assigned when the call completes, so ordering survives async writes |
| `ts`       | UTC, RFC3339 with nanoseconds                                                  |
| `actor`    | Platform **username** — `alice`, `bob`, `hackagon-admin`, or `anonymous`       |
| `method`   | `hackathon.HackathonService/Edit` — recipe form, no leading slash              |
| `params`   | The request, after the allowlist below                                         |
| `expect`   | `{"ok": true}` or `{"error": "PermissionDenied"}`                              |
| `produced` | UUIDs the response reported, keyed by dot-path (`id`, `voteCategory.id`)       |

```text
{"seq":42,"ts":"2026-08-08T09:14:22.913Z","actor":"alice","method":"hackathon.ProjectService/Propose","params":{"hackathonId":"…","title":"<redacted>","description":"<redacted>","trackId":"…"},"expect":{"ok":true},"produced":{"projectId":"…"}}
```

## What is never recorded

Not "stripped afterwards" — never read in the first place:

- **No IP address.** The peer is not looked up.
- **No user agent, no session id, no trace id.** No metadata is read beyond the
  claims the auth interceptor already parsed.
- **No Keycloak ID.** The JWT subject is resolved to a platform username before
  the line is written and never reaches disk. A subject with no `User` row —
  someone who authenticated but has not registered — is written as `unknown:`
  plus eight hex characters of its SHA-256, which keeps two strangers
  distinguishable within one journal and identifies neither.
- **No free text and no personal data**, per the allowlist below.
- **Nothing from a response except ids.** The only response values read are
  those under a key named `id` or `…Id` whose value is a canonical UUID.

Calls rejected by the auth interceptor itself (invalid or expired token) never
reach the journal. That is a transport failure, not an action somebody took.

## The redaction policy

`internal/audit/redact.go` holds one flat table. **A request field is recorded
verbatim only if its JSON name is in it. Everything else becomes
`"<redacted>"`** — including any field added to a proto after the table was last
read.

Recorded:

| Group        | Examples                                                              | Why                                                  |
| ------------ | --------------------------------------------------------------------- | ---------------------------------------------------- |
| Identifiers  | `id`, `hackathonId`, `userId`, `projectId`, `submissionId`, `pageIds` | The point of the journal — which object was acted on |
| Slugs        | `slug`, `newSlug`                                                     | The address of a site page                           |
| Enumerations | `visibility`, `votingMethod`, `role`, `capability`, `kind`, `format`  | Closed vocabularies; the .proto lists every value    |
| Flags        | `visible`, `enabled`, `required`, `votingEnabled`, `force`            | A boolean carries no text                            |
| Numbers      | `order`, `rank`, `points`, `maxPoints`, `extendMinutes`, `scale`      | Positions, counts and limits                         |
| Timestamps   | `startsAt`, `endsAt`, `registrationCloses`, `submissionsClose`        | Scheduling is structure                              |
| Colours      | `primaryColor`, `accentColor`                                         | Chosen for an event, not by or about a person        |
| Containers   | `fields`, `prizes`, `awards`, `submissions`, `singleChoice`, `ranked` | Recursed into — listing one grants children nothing  |

Redacted, with the reason spelled out in the file:

| Fields                                                                              | Why                                                                               |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `name`, `title`, `description`, `content`, `label`, `note`, `reason`, `bannerText`  | Authored prose                                                                    |
| `responses`, `consents`                                                             | Registration answers — dietary needs, accessibility — and what a person agreed to |
| `templates`, `data`                                                                 | Free-form maps with caller-chosen keys AND values                                 |
| `displayName`, `username`, `email`, `affiliation`, `skills`, `dietary`, `avatarUrl` | Personal data straight out of the profile                                         |
| `key`, `filename`                                                                   | An object-store key embeds a file name, routinely a person's name                 |
| `token`, `inviteToken`                                                              | Secrets                                                                           |
| `logo`, `image`, `result`                                                           | May be a multi-megabyte `data:` URI                                               |

Worked example — `SubmitRegistrationForm`, the call the policy exists for:

```text
{"actor":"bob","method":"hackathon.HackathonService/SubmitRegistrationForm",
 "params":{"hackathonId":"7c1e…","responses":"<redacted>","consents":"<redacted>"},
 "expect":{"ok":true}}
```

`responses` is a `google.protobuf.Struct` with organizer-defined keys, so it
collapses **whole**: walking into it would record caller-chosen key names even
if every value were replaced. The journal knows Bob submitted his form and
nothing about what he wrote in it.

A kept container is the opposite case — it is recursed into, so its children
face the same table. `prizes: [{rank: 1, title: "…"}]` records the rank and
redacts the title.

The default is the guarantee, and it is asserted:
`TestRedactDefaultsToRedactedForUnknownFields` in `redact_test.go` fails if an
unclassified field is ever recorded.

## Never breaking a request

1. The interceptor runs **after** the handler and cannot change what it returns.
   Its own bookkeeping is wrapped in a `recover()` — a panic while journalling
   is logged and the RPC is unaffected.
2. Entries go to a buffered channel; a single writer goroutine owns the file.
   When the buffer fills, entries are **dropped and counted**, because an RPC
   waiting on file IO is a worse outcome than a gap in the journal. The drop
   count is warned once and again at shutdown.
3. The username lookup happens on the **writer** goroutine, memoized, so a
   database round-trip never lands on a request's critical path. (It also means
   a `Register` has committed by the time its own line is resolved, so the
   caller is named rather than pseudonymous.)

## Turning it on

In `components/backend/data/test/config/config.yaml`:

```yaml
audit:
  enabled: true
  path: ".output/audit/rpc-journal.jsonl" # relative to components/backend
```

or by environment: `HACKAGON_AUDIT_ENABLED=true`, `HACKAGON_AUDIT_PATH=…`,
`HACKAGON_AUDIT_BUFFER=8192`.

Restart the backend (`just deploy::proc-comp process restart backend`). It logs
a warning at startup naming the file and what it collects — a recording process
should be obvious from its own logs.

`.output/` is gitignored.

## Turning a journal into recipe drafts

```bash
bash .claude/skills/hackathon-e2e/scripts/journal-to-recipe.sh \
  --dedupe --out /tmp/draft.jsonl
```

It copies `actor` / `method` / `params` / `expect` straight across (the journal
is written in the recipe's own field names), and substitutes ids for recipe
templates: a UUID first seen in a call's `produced` map is bound to a variable,
every later occurrence in any params tree is rewritten to `{{hackathonId}}` /
`{{var:NAME}}` / `{{userId:alice}}`, and the defining call gets the matching
`save`.

`id`, `title`, `outcome`, `priority`, `act` and `t` are left **empty**. That is
deliberate: the recipe's value is the human judgement about what _should_
happen, and a generated `outcome` that reads plausible but was never thought
about is worse than a blank one.

The last line of its output names the ids it could not template — the actions
somebody has to fix by hand.

By default it drops `health.HealthService/Check` (the readiness probe) and read
methods (`Get`/`List`/`WhoAmI`/…), because the frontend issues those on every
page load; `--keep-health` and `--keep-reads` put them back. Reads are still
used for _binding_ even when filtered out — `WhoAmI` is where a person's DB id
becomes knowable, and dropping it from the draft must not cost
`{{userId:alice}}`.

**A journal seeds a recipe; it does not write one.** It captures traffic, not
intent: the deliberate failures the recipe is largely made of
(`expect: {"error": "PermissionDenied"}` — alice tries to edit a page she does
not own) appear as ordinary lines with no hint that the denial was the point.
