---
name: dbml-diagrams
description:
  Build and validate DBML database diagrams (dbdiagram.io) from the ent schema.
  Use when asked for a database/ER diagram, to update docs/backend/schema.dbml
  after a schema change, or when dbdiagram.io reports parse errors like "An Enum
  must have only a field and optionally a setting list". ALWAYS validate with
  the official parser before sharing — never ship unvalidated DBML.
---

# DBML diagrams for the Hackagon schema

The canonical diagram file is `docs/backend/schema.dbml`. Source of truth is the
ent schema (`components/backend/db/schema/*.go`), rendered human-readably in
`components/backend/Schema.md` — regenerate that first after schema edits
(`just codegen::db-schema`), then update the DBML from it, then **validate**.

The DBML was brought level with the ent schema on 2026-08-08 — all 23 physical
tables are present and every name in it is now the one ent generates. Re-check
it against `ent/migrate/schema.go` (see step 2) after any schema edit.

## The workflow

1. `just codegen::db-schema` — refresh `Schema.md` from the ent sources.
2. Edit `docs/backend/schema.dbml` to match (mapping rules below). **Read the
   physical names off `components/backend/ent/migrate/schema.go`, not off
   `Schema.md`** — that file lists edges by their Go name (`hackathon`,
   `modifier`) and only names the columns inside its index lists, so guessing a
   FK column from an edge name is how the diagram drifted last time. Its
   `<Table>Columns` blocks give every column, its nullability and its FK target;
   `PrimaryKey:` shows which join tables have a composite key and no `id` at
   all.
3. **Validate**: `bash .claude/skills/dbml-diagrams/scripts/validate.sh` (wraps
   the official `@dbml/cli` parser — the same one dbdiagram.io uses).
4. Only then share / commit / paste into https://dbdiagram.io/d.

## Mapping ent → DBML

| ent concept                                         | DBML                                                                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entity `FooBar`                                     | `Table foo_bars` (snake_case plural; already-plural names unchanged)                                                                                                                                               |
| M2O edge with inverse `bars` on parent `Foo`        | FK column named `foo_bars` → `[ref: > foos.id]` (so `pages.hackathon_pages`, `votes.user_votes`)                                                                                                                   |
| O2O edge to hackathon                               | Same convention, NOT `hackathon_id`: `hackathon_settings`, `hackathon_windows`, `hackathon_forms`, and — because the edge is called `prize_table` — `hackathon_prize_table`, each `[unique, ref: - hackathons.id]` |
| Explicit join entity (Participant, TeamParticipant) | Its own Table with real `*_id` field columns and a COMPOSITE `[pk]` index — ent gives these no `id` column                                                                                                         |
| Implicit M2M edge                                   | A join table `<owner>_<edge>` with composite `[pk]` index (`user_preferred_projects`, `user_jury_categories`)                                                                                                      |
| `Optional().Nillable()` field                       | Column without `not null`                                                                                                                                                                                          |
| enum field                                          | A DBML `Enum` block + column typed with it                                                                                                                                                                         |
| Composite unique index                              | `indexes { (col_a, col_b) [unique] }`                                                                                                                                                                              |

## Syntax gotchas (each one has bitten us)

- **Enums: ONE value per line.** `Enum v { public private }` fails with "An Enum
  must have only a field and optionally a setting list" — every value on its own
  line inside the block.
- Reserved/odd column names need double quotes: `"order" int`.
- Inline refs: `>` many-to-one, `<` one-to-many, `-` one-to-one.
- Notes use single quotes; avoid apostrophes inside them (or escape by
  rephrasing) and never nest single quotes.
- Composite PK only via `indexes { (a, b) [pk] }`, not on columns.
- Table `Note:` goes inside the table body on its own line.

## Validating

`scripts/validate.sh [file]` (default `docs/backend/schema.dbml`) runs
`dbml2sql` — if it emits SQL, the file parses; any error is exactly what
dbdiagram.io would show. It uses pnpm/npx where available and otherwise routes
through the devcontainer's Nix shell automatically.
