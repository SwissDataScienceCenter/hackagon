---
name: backend-api-explore
description:
  Find out what the Hackagon backend actually offers and whether it works —
  enumerate gRPC services and RPCs via reflection, read request/response shapes,
  check the DB schema, determine which handlers are really implemented vs
  stubbed, and call any endpoint with just rpc::as / rpc::unauth. Use when asked
  what services or RPCs exist, what a request looks like, whether something is
  implemented, what the DB holds, or to reproduce a backend error over the wire.
  Never rely on a written status list — determine it here.
---

# Exploring and testing the backend API

**Determine status; never trust a written one.** Any list of "implemented
services" in a doc is a snapshot that started rotting the moment it was
committed. The commands below are the source of truth. If you need to state what
the backend supports, run them first.

## Prerequisite: grpcurl needs the Nix shell

`grpcurl`, `buf` and friends are not on the normal PATH. Inside the dev shell
(`direnv allow`, or `just develop`) everything just works. From a plain shell,
wrap the command:

```bash
just nix::develop default <command...>
# e.g. just nix::develop default just rpc::as alice aliceandbob user.UserService/WhoAmI
```

Symptom if you forget: `grpcurl: command not found` and
`error: Recipe 'as' failed ... exit code 127`.

The backend must also be running — `just start` from the repo root; it listens
on **localhost:3000**. Check with `nc -z localhost 3000`.

## Do the whole recon in one call

The numbered steps below explain each probe in isolation. **Don't run them as
separate tool calls** — reflection is cheap over the wire and expensive per
round trip, since every call re-bills the entire context window (see the context
budget in `CLAUDE.md`). Get the full inventory in one shot, then read:

```bash
# every service, every RPC, and the handlers actually written — one call
for s in $(grpcurl -plaintext localhost:3000 list | grep -v ^grpc.reflection); do
  echo "=== $s"
  grpcurl -plaintext localhost:3000 list "$s" | sed 's/^/  rpc /'
done
echo "=== handlers in internal/service"
grep -rhoE "^func \(s \*[A-Za-z]+Service\) [A-Za-z]+" \
  components/backend/internal/service/ | sort
```

Diff those two lists mentally: an RPC present above but absent below is answered
by the embedded `UnimplementedXServiceServer`. That single call replaces steps
1, 2 and the cross-check.

Same discipline for message shapes — batch the `describe` calls for every RPC
you care about rather than one per turn:

```bash
for m in hackathon.ProjectService.SetPreference hackathon.TrackService.List; do
  grpcurl -plaintext localhost:3000 describe "$m"
done
```

And when the whole thing needs the Nix wrapper, wrap **once** around a batched
script, never once per command:

```bash
just nix::develop default bash -c '
  grpcurl -plaintext localhost:3000 list
  just rpc::as alice aliceandbob user.UserService/WhoAmI
'
```

If the recon is broad and open-ended ("what does this backend do?"), hand it to
a subagent instead: its greps and dumps stay in its own window and only the
findings come back.

## 1. What services exist? (gRPC reflection)

`reflection.Register(server)` is called in `internal/service/server.go`, so the
running server describes itself. This is the authoritative inventory:

```bash
grpcurl -plaintext localhost:3000 list
```

```
grpc.health.v1.Health
grpc.reflection.v1.ServerReflection
grpc.reflection.v1alpha.ServerReflection
hackathon.HackathonService
hackathon.PageService
hackathon.PhaseService
hackathon.ProjectService
hackathon.TeamService
hackathon.TrackService
user.UserService
vote.VoteService
```

Note the names come from the proto `package`, not the folder: `user.*`,
`vote.*`, and everything else under `hackathon.*`. `grpc.health.v1.Health` is
the well-known health service from grpc-go — there is no `api/proto/health/`.

**What this does and doesn't tell you:** it lists services _registered on the
server_. A service appears here as soon as `server.go` registers it — that is
not proof every RPC has a real handler (see step 4).

## 2. What RPCs does a service have?

```bash
grpcurl -plaintext localhost:3000 list hackathon.ProjectService
```

```
hackathon.ProjectService.Approve
hackathon.ProjectService.Delete
hackathon.ProjectService.Disapprove
hackathon.ProjectService.Edit
hackathon.ProjectService.ExportPreferences
hackathon.ProjectService.Get
hackathon.ProjectService.GetPreference
hackathon.ProjectService.List
hackathon.ProjectService.Propose
hackathon.ProjectService.RemovePreference
hackathon.ProjectService.SetPreference
```

Cross-check against the handlers actually written:

```bash
grep -oE "^func \(s \*ProjectService\) [A-Za-z]+" \
  components/backend/internal/service/project_service.go
```

## 3. What does a request look like?

```bash
grpcurl -plaintext localhost:3000 describe hackathon.ProjectService.SetPreference
# rpc SetPreference ( .hackathon.messages.project_svc.SetPreferenceRequest )
#            returns ( .hackathon.messages.project_svc.SetPreferenceResponse );

grpcurl -plaintext localhost:3000 describe .hackathon.messages.project_svc.SetPreferenceRequest
# message SetPreferenceRequest {
#   string project_id = 1 [(.buf.validate.field) = { string: { uuid: true } }];
# }
```

The leading `.` on a message name is required. `describe` also surfaces
**buf.validate** constraints — worth reading, since a malformed field fails
before your handler is reached.

Other references, in order of reliability:

| Source                              | What it is                           | Caveat                                   |
| ----------------------------------- | ------------------------------------ | ---------------------------------------- |
| reflection (above)                  | what the running server exposes      | most trustworthy                         |
| `api/proto/**/*.proto`              | hand-written contracts               | may be ahead of the handlers             |
| `api/proto/API.md`                  | generated proto reference, ~5k lines | generated — grep it, don't read it whole |
| `components/backend/Schema.md`      | generated DB reference, ~320 lines   | fields, edges, indexes per entity        |
| `components/backend/db/schema/*.go` | hand-written DB source of truth      | Schema.md is generated from this         |

## 4. Is an RPC actually implemented?

Three states, distinguished by calling it:

| Result                                 | Meaning                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `Unimplemented`                        | contract exists, no handler — the embedded `UnimplementedXServiceServer` is answering |
| `PermissionDenied` / `InvalidArgument` | handler **exists** and ran; you hit auth or validation                                |
| a payload                              | implemented and working                                                               |

So an error is often good news: `PermissionDenied` proves the handler is there.
Only `Unimplemented` means missing.

```bash
just rpc::as alice aliceandbob hackathon.TrackService/List '{"hackathonId":"<uuid>"}'
```

## 5. Calling endpoints

```bash
just rpc::unauth <method> [json]                 # anonymous
just rpc::as <user> <password> <method> [json]   # fetches a Keycloak token first
just rpc::help                                   # usage
```

Dev users, all with password `aliceandbob`:

| User             | Standing                                    |
| ---------------- | ------------------------------------------- |
| `hackagon-admin` | global Admin — bypasses every casbin rule   |
| `alice`          | global HackathonOrganizer; owner of H1      |
| `bob`            | plain participant                           |
| `charles`        | **waitlisted** in H1 — use to test refusals |

Worked example — list hackathons, then read one:

```bash
just rpc::as alice aliceandbob hackathon.HackathonService/List '{}' \
  | jq -r '.hackathons[] | "\(.id)  \(.name)"'

just rpc::as alice aliceandbob hackathon.HackathonService/Get \
  '{"hackathonId":"<uuid>"}' | jq '.hackathon.projects[0]'
```

`hackathon.Get` returns the **full tree** (projects, tracks, pages, phases,
members), so it's usually the cheapest way to get IDs for other calls. `List`
returns shallow entities only.

For DB-side inspection: `just db::psql` for a shell, `just db::summary` for a
row-count overview.

## 6. Interpreting failures

- **`Unauthenticated`** — invalid/expired token. No token at all is _not_ this;
  it becomes anonymous and usually yields `PermissionDenied` instead.
- **`InvalidArgument`** — buf.validate rejected the payload. `describe` the
  request message and check the constraints.
- **`PermissionDenied`** — casbin refused. Before assuming a bug, check three
  things in order:
  1. **Is the caller a confirmed participant?** Waitlisted users are refused by
     design (`charles` in H1).
  2. **Is it capability-gated?** `SetPreference`, `RemovePreference`, `Propose`
     and submission RPCs need a capability that only
     `HackathonService.SetCapabilities` can switch on — and `cmd/seed` creates
     no `HackathonState` row, so **in seeded data these always refuse**. This is
     configuration, not a bug. Reproducible today:
     ```
     just rpc::as alice aliceandbob hackathon.ProjectService/SetPreference '{"projectId":"<uuid>"}'
     → Code: PermissionDenied
     ```
  3. **Is the caller an Owner where the rule grants Member?** The casbin model
     has no role inheritance, so an owner is refused by a Member-scoped policy.

  Compare against `hackagon-admin`, who bypasses casbin entirely — if the call
  succeeds as admin and fails as alice, it's a policy question, not a handler
  bug.

Background on the capability mechanism and known gaps: the
**backend-service-dev** skill, and `mydocs/docs/backend-tickets/`.

## Reporting what you found

When asked "what does the backend support", give the reflection output and the
handler cross-check — not a remembered list. Say when you checked, and note that
proto contracts can be ahead of handlers.
