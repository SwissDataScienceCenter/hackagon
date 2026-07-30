---
name: api-proto
description:
  hackagon's protobuf/gRPC API conventions — folder layout, the _svc suffix,
  read-path vs write-path contracts, buf validation, and how to regenerate Go and
  TypeScript stubs. Use when editing anything under api/proto/, adding an RPC or
  message, or when generated clients look out of date.
---

## Layout

```
api/proto/
├── <domain>/                     # hackathon, user, health
│   ├── <name>_service.proto      # service definition (RPCs)
│   ├── entities/                 # nouns (domain types, enums)
│   └── messages/<svc>_svc/       # verbs (request/response payloads)
│       └── *_request.proto       # one message per file
```

The `_svc` suffix is a buf workaround for path-segment name collisions (buf
rejects `hackathon/messages/hackathon/`). It means "messages belonging to
service X".

One message per file. Requests and responses live in `messages/`, never in the
service file.

## Read path

- `List*Response` returns **shallow** entities — scalars and IDs only.
- `Get*Response` returns the **full tree** — embeds creator, modifier, related
  collections.
- `ListRequest` carries explicit filter fields (e.g. `string hackathon_id = 1;`),
  never a generic filter blob.
- Optional enum filters: `UNSPECIFIED` means "no filter".
- Column-backed filters push down to SQL via `.Where()` (e.g. `visibility_filter`);
  computed filters (e.g. `status_filter` on `HackathonStatus`, which is derived not
  stored) stay post-query. See `hackathon_service.go:List`.
- There is **no pagination** anywhere — no `page_size`/`page_token`/`limit`/
  `offset`/`cursor` on any message. Adding it would be a proto + DB change.

## Write path

Settled and applied across every service — match it:

- `Edit*Request`: every field `optional` (no FieldMask).
- `Create`/`Add`/`Propose`: return `{id}` only.
- `Edit`: return the updated entity.
- `Delete`: return `{}`.
- `Add*`/`Remove*` on a relation (e.g. `AssignUser`): return the mutated parent.
  Precedent: `AddRole` returns the user.

For `optional` string fields where empty means "unset the link", document it
inline — `phase_svc/edit_request.proto`'s `page_id` is the precedent ("empty
string = unlink, non-empty = link, not set = no change").

## Validation

Constraints are declared in the proto with `buf.validate` and enforced by a
server interceptor, so handlers don't re-check them:

```proto
string hackathon_id = 1 [(buf.validate.field).string.uuid = true];
string name = 2 [
  (buf.validate.field).string.min_len = 3,
  (buf.validate.field).string.max_len = 255
];
```

Cross-field rules use a message-level CEL expression — see
`phase_svc/create_request.proto` for the `starts_at`/`ends_at` pairing.

Mirror `min_len`/`max_len` in the frontend form (`minlength`/`maxlength`) so users
get inline feedback instead of a round-trip `InvalidArgument`.

## Regenerating

```bash
just codegen::proto      # Go + TypeScript stubs; wipes codegen dirs first
just api-change          # the above, then restart the stack
```

`buf` is **not on PATH outside the Nix shell** — enter it with `just develop`, or
stage the proto change and ask the user to regenerate.

Never hand-edit generated output: `components/backend/internal/proto/**`,
`components/frontend/src/lib/server/grpc/generated/**`, `api/proto/API.md`.

`API.md` is generated documentation — a useful place to read the current contract
for a message without opening several proto files.
