---
name: docs-bundle
description:
  Build the whole docs/ folder into ONE self-contained static HTML file — images
  re-encoded to webp and inlined as data URIs, mermaid diagrams pre-rendered to
  inline SVG, cross-document links rewritten to anchors. No network, no CDN, no
  JS needed to read it. Use when asked for a single shareable documentation
  file, an offline/emailable doc bundle, a docs PDF, or to export the
  documentation.
---

# Single-file documentation bundle

One HTML file containing every markdown document under `docs/`. Nothing loads at
view time — hand it to anyone, open it from a USB stick or an email attachment,
print it to PDF.

## Build

```bash
# from a host without node:
bash .claude/skills/devcontainer-up/scripts/exec.sh just develop \
  bash -c "cd .claude/skills/docs-bundle && pnpm install && node scripts/build.mjs"

# inside the dev shell:
cd .claude/skills/docs-bundle && pnpm install && node scripts/build.mjs
```

Output: `out/hackagon-docs.html`. `docs/` currently holds **23 markdown
documents, 26 screenshots and 7 mermaid diagrams**; the last build on disk came
to 1.8 MB. Only 17 documents are named in `ORDER` — the rest are appended
alphabetically and reported, so a new file is never silently dropped, but it
does land at the end until someone places it.

| Flag            | Default                  | Effect                                                 |
| --------------- | ------------------------ | ------------------------------------------------------ |
| `--out FILE`    | `out/hackagon-docs.html` | write somewhere else                                   |
| `--quality N`   | `78`                     | webp quality                                           |
| `--max-width N` | `1400`                   | downscale wider images                                 |
| `--no-mermaid`  | off                      | skip diagram rendering (faster; blocks stay as source) |

## What it does

| Step            | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order           | An explicit `ORDER` list in `build.mjs` (README first, TODO last). Anything in `docs/` not listed is **appended alphabetically and reported**, so a new file is never silently dropped.                                                                                                                                                                                                                                                           |
| Images          | Every `<img src>` — HTML tags _and_ markdown `![]()` — resolved relative to its own document, re-encoded to webp with sharp, inlined as a data URI. SVGs pass through untouched (re-encoding would rasterize them). Missing files warn and keep their original `src`.                                                                                                                                                                             |
| Diagrams        | ` ```mermaid ` blocks are pulled out **before** markdown parsing, rendered in a headless browser, and reinserted as inline SVG. If rendering is unavailable the block degrades to a labelled source listing rather than vanishing.                                                                                                                                                                                                                |
| Diagram theming | Mermaid is themed with the **same palette as the hand-laid C4 SVGs** (`dev/scripts/render-diagrams.mjs`), so both diagram families read as one system. Mermaid bakes colours at render time, so each block is rendered **twice** (light + dark) and CSS shows the matching one; print forces light. The C4 SVGs need no such trick — they carry their own `prefers-color-scheme` block. Changing the palette means editing it in **both** places. |
| Links           | `foo.md` and `backend/rbac.md#x` become in-page anchors. Links to files that are not part of the bundle are left alone.                                                                                                                                                                                                                                                                                                                           |
| Navigation      | Sticky sidebar: every document plus its `##` headings.                                                                                                                                                                                                                                                                                                                                                                                            |
| Provenance      | Branch, short commit and build date in the sidebar and on the cover — a shared file always says which state of the repo it describes.                                                                                                                                                                                                                                                                                                             |

Light and dark are both styled (`prefers-color-scheme`), and there is a print
stylesheet: the sidebar disappears, each document starts on a new page, and
code/tables/figures avoid page breaks — so _Print → Save as PDF_ gives a decent
handout.

## Requirements

`pnpm install` in this folder pulls `marked`, `sharp`, `mermaid` and
`playwright`. The Playwright **browser binary is shared** with the hackathon-e2e
skill (per-user cache), so this does not download another one — and if no
browser is available the build still succeeds, just without rendered diagrams.

## Gotchas worth knowing

- **Semicolons break mermaid.** `;` terminates a statement, so
  `A->>B: did x; then y` is a parse error — the diagram silently fails to
  render, on GitHub too. One such error existed in `architecture.md` and was
  fixed when this skill was built; the builder reports any block it cannot
  render instead of dropping it.
- Images are inlined **once and cached**, so the same screenshot used in two
  documents costs one copy.
- The output is regenerated wholesale; it is gitignored (`out/`) because it is a
  build artifact, not a source of truth.
