---
name: seed-past-hackathons
description: Populate a running Hackagon instance with SDSC's real past hackathons — one source-cited JSON per edition under data/, with all images downloaded into static/. Covers the editions from the live sdsc-hackathons.ch platform (Firestore) plus the Energy Data Hackdays. Use when asked to seed past/previous/archived hackathons, migrate the old platform's content, fill the platform with real history, add a new past edition, or demo the archive with authentic content.
---

# Seed past SDSC hackathons

One JSON per edition in `data/`, every image in `static/<slug>/`, so the folder
is self-contained. `scripts/seed.sh` creates them on a running instance; their
dates are in the past, so they render as **Finished** — an instant archive to
demo against and a realistic fixture for the public pages.

## Editions on file

| File | Event | When | Where | Source |
| --- | --- | --- | --- | --- |
| `2023-11-generative-ai.json` | SDSC Hackathon: Generative AI | 30 Nov – 1 Dec 2023 | ETH Andreasturm, Zurich Oerlikon | live platform (archived) + event page |
| `2024-10-ord-for-the-sciences.json` | SDSC Hackathon: ORD for the Sciences | 24–25 Oct 2024 | BC Building, EPFL, Lausanne | live platform (archived) + event page |
| `2025-09-energy-data-hackdays.json` | Energy Data Hackdays 2025 | 11–12 Sep 2025 | FHNW Brugg-Windisch | SDSC event page |
| `2026-05-energy-data-hackdays-lausanne.json` | Energy Data Hackdays — Spring, Lausanne | 7–8 May 2026 | Biopôle, Lausanne | SDSC article |
| `2026-06-durham-group-1.json` | Hackathon with Uni Durham — Group 1 | 2–3 Jun 2026 | SDSC, Arginine bld, Biopôle | **live platform** |
| `2026-06-durham-group-2.json` | Hackathon with Uni Durham — Group 2 | 9–10 Jun 2026 | SDSC, Arginine bld, Biopôle | **live platform** |

The Durham pair and the two SDSC editions come straight from the **current
platform's own database** — sdsc-hackathons.ch is a FlutterFlow app on
Firestore (project `sdschacks`, collection `hackathons`); each record carries
its `platformRef` with the document id, so the mapping old→new is traceable.
Read one directly with:

```bash
curl "https://firestore.googleapis.com/v1/projects/sdschacks/databases/(default)/documents/hackathons/<docId>"
```

Not on file: `qhe3gH7y0I6NpMTSzHyr` ("This is a test hackathon", not visible).

## Run

```bash
bash .claude/skills/seed-past-hackathons/scripts/fetch-media.sh   # images → static/
bash .claude/skills/seed-past-hackathons/scripts/validate.sh      # JSON + dates + images
bash .claude/skills/seed-past-hackathons/scripts/seed.sh --dry-run
bash .claude/skills/seed-past-hackathons/scripts/seed.sh          # needs the stack up
```

Needs `grpcurl`, `jq`, `curl` (Nix dev shell). From a host without them:

```bash
bash .claude/skills/devcontainer-up/scripts/exec.sh just develop \
  bash .claude/skills/seed-past-hackathons/scripts/seed.sh
```

Seeding is **idempotent** — an edition whose name already exists is skipped.

## Images

`fetch-media.sh` puts every image in `static/<slug>/` (14 files today) and
records `static/checksums.sha256` trust-on-first-use; a later run verifies and
warns if a remote file changed. Two source schemes:

- `"source": "https://…"` — downloaded (Firebase Storage, SDSC CDN, EDHD site)
- `"source": "repo:components/frontend/static/images/…"` — copied from the repo

Stored artefacts are **WebP** (`media[].file` ends in `.webp`); `source` keeps
the real provenance URL, so a source that is still JPEG/PNG upstream is
re-encoded at q80 on arrival. That needs `cwebp`, which is not in the dev
shell — run `nix shell nixpkgs#libwebp -c bash scripts/fetch-media.sh`.

**This is the debug arrangement.** When a real image service exists, only
`media[].source` and whatever the seeder writes into page markdown change —
the records themselves stay as they are.

## Record shape

```jsonc
{
  "slug": "durham-2026-group-1",
  "name": "Hackathon with Uni Durham — Group 1",
  "platformRef": { "documentId": "xKRA1U6f8btkHakhky5n", … },  // old-platform trace
  "visibility": "VISIBILITY_PUBLIC",
  "startsAt": "2026-06-02T08:30:00+02:00",   // real local time, real offset
  "endsAt":   "2026-06-03T17:00:00+02:00",
  "venue": "…", "organizers": ["…"], "partners": ["…"], "theme": "…",
  "description": "…",                        // → hackathon description
  "tracks":  [ { "name": "…", "description": "…" } ],
  "phases":  [ { "name": "…", "startsAt": "…", "endsAt": "…" } ],
  "pages":   [ { "title": "Programme", "order": 2, "visible": true, "content": "markdown…" } ],
  "media":   { "images": [ { "file": "cover.webp", "source": "https://…", "caption": "…", "credit": "…" } ] },
  "votingCategories": [ { "title": "…", "numberOfWinners": 1 } ],
  "preEventTimeline": [ { "order": 0, "process": "Registrations", "when": "13.05.2026 - 22.05.2026" } ],
  "capabilities": { "can_register": true, … },   // old platform's flags, for reference
  "stats":   { "teams": 20, "projects": 15 },
  "source":  { "urls": ["…"], "retrieved": "2026-08-05", "note": "what was verified" }
}
```

`votingCategories`, `preEventTimeline` and `capabilities` are recorded but not
yet seeded — they map onto `VoteService`, `ConfigService.SetWindows` and the
capability rows respectively. Wiring them is the natural next step.

## Adding an edition

1. `curl` the Firestore doc (or gather from a citable page).
2. Copy an existing JSON, fill it in, list images with their `source`.
3. `fetch-media.sh` → `validate.sh` → `seed.sh`.

## Accuracy policy

Archive material, so **nothing is invented**. Where a source did not publish
something (winners everywhere; participant counts for 2023 and Durham), the
field is empty and `source.note` says so. Two recorded caveats worth keeping:

- The Durham agenda entries in Firestore carry **May date parts on a June
  event** (template leftovers). Only the times are meaningful, so phases are
  anchored to the real event days with times converted from UTC to +02:00.
- The Energy Data Hackdays are **EDIH-run with SDSC participating**, not
  SDSC-run, and are not in the old platform's database.

## Notes

- `PhaseService.Create` silently drops dates (bug B4 in `docs/TODO.md`), so the
  seeder creates each phase then `Edit`s the dates in. Drop that once fixed.
- Everything is created as `hackagon-admin` (override with
  `HACKAGON_ADMIN_USER` / `HACKAGON_ADMIN_PASS`).
