# Testing

This page was empty until now while being linked from `docs/README.md` and from
`getting-started.md`'s "See also". What follows is deliberately narrow: the
suites are described from their configuration (`.component.yaml`,
`playwright.config.ts`, `tools/just/check.just`), and the one command whose
result is quoted is the one that was actually executed for this page.

## Suites that exist

| Suite          | Where                                                                     | Run with                          |
| -------------- | ------------------------------------------------------------------------- | --------------------------------- |
| Go unit tests  | `components/backend/**/*_test.go` (ginkgo; build tags `test && unittest`) | `just check::test -c backend`     |
| Frontend units | `components/frontend/src/**/*.{test,spec}.ts` (vitest, jsdom)             | `just check::test -c frontend`    |
| End-to-end     | `.claude/skills/hackathon-e2e/tests/` (Playwright, Firefox)               | `scripts/run.sh <suite>` — below  |
| Lint           | golangci-lint, eslint, svelte-check, typos, yamllint                      | `just check::lint -c <component>` |
| Format         | prettier / gofmt via treefmt                                              | `just check::format -c <comp>`    |
| Codegen drift  | regenerate everything, then `git diff --exit-code`                        | `just ci::codegen-check`          |

`just ci::all` chains the CI stages; `.github/ci-cd.md` maps each stage to the
command that reproduces it locally.

## End-to-end

`playwright.config.ts` defines the projects. `setup` logs every persona in
through the real Keycloak flow and saves a storage state per persona; every
other project depends on it.

| Project      | Database it expects | What it is                                                  |
| ------------ | ------------------- | ----------------------------------------------------------- |
| `smoke`      | the seed fixture    | what each persona can see and do                            |
| `journey`    | **empty**           | the lifecycle recipe (`recipe.jsonl`), act by act           |
| `mobile`     | either              | phone viewport battery, screenshots to `.artifacts/mobile/` |
| `docs`       | the seed fixture    | regenerates `docs/flows/` images; needs `DOCS_SHOTS=1`      |
| `openreplay` | the seed fixture    | session-replay privacy proof; needs a live OpenReplay       |

Everything is serial (`workers: 1`, `retries: 0`): the journey is stateful and
the smoke suite shares one seeded database.

```bash
bash .claude/skills/hackathon-e2e/scripts/run.sh smoke
bash .claude/skills/hackathon-e2e/scripts/run.sh journey
```

`run.sh` owns the whole cycle: reset → boot the stack → wait ready → seed (or
provision the extras roster for the journey) → probe which RPCs exist → install
Playwright's Firefox → run. Two consequences worth knowing before you read a
failure:

- **The suite does not test `vite dev`.** `wait-ready.sh` calls
  `prod-frontend.sh ensure`, which builds the adapter-node server and serves
  that instead. A cold Vite that answers slowly is not a usable target.
- **Seeding is followed by a backend restart.** casbin loads its policy once at
  startup, so roles the seed writes into Postgres are invisible until then.

The HTML report lands in `.claude/skills/hackathon-e2e/.artifacts/report`
(`pnpm --dir .claude/skills/hackathon-e2e run report`), and a machine-readable
summary in `.artifacts/results.json` — which survives a `docker exec` whose
client got interrupted, unlike the console reporter.

## Executed for this page

From a **clean clone** of `sketch/06-08-26` in its own devcontainer
(2026-08-10):

```
bash .claude/skills/hackathon-e2e/scripts/run.sh smoke
```

```
80 passed (2.5m)
```

Four of those are the `setup` project (one login per persona) and 76 are the
smoke specs. Zero failed, zero skipped. Everything before Playwright — reset,
boot, seed, backend restart, probe, `pnpm install`,
`playwright install --with-deps firefox` — is done by `run.sh` and took most of
the wall clock.

The object store (`rustfs`) was running for that run. Without it the app still
boots and serves, but `tests/smoke/15-media-upload.spec.ts` has nowhere to PUT
its bytes — see `.devcontainer/README.md` for the required-vs-optional split.
