---
description: Quitsh CLI tool architecture and patterns for the Hackagon project
globs: tools/quitsh/**/*.go
alwaysApply: false
---

# Quitsh in Hackagon

Quitsh is the Hackagon project's CLI tool for build orchestration. It's a custom binary at `tools/quitsh/` built on the upstream `github.com/sdsc-ordes/quitsh` library.

## Architecture

- **Entry:** `tools/quitsh/cmd/quitsh/main.go` -- initializes config, CLI, registers commands and runners, calls `cli.Run()`.
- **Command wiring:** `tools/quitsh/cmd/quitsh/cmd/all.go` -- `AddCommands()` attaches all Cobra subcommands.
- **Runner registration:** `tools/quitsh/pkg/runner/register.go` -- `RegisterAll()` registers all runners with the factory.
- **Config:** `tools/quitsh/pkg/config/config.go` -- Hackagon-specific settings wrapping upstream config.

## Two Extension Patterns

### 1. Standalone Commands (like `format`, `setup`, `nix`, `generate-schema`)

- Create `cmd/quitsh/cmd/<name>/<name>.go` with `func AddCmd(root *cobra.Command, ...)`.
- Wire in `all.go`: `cnFoo.AddCmd(cl.RootCmd(), ...)`.
- Use for developer utilities that don't participate in the build DAG.
- Can use `git.NewCtxAtRoot(".")` to find the repo root.
- Can use `exec.NewCmdCtxBuilder().BaseCmd("...").Cwd(...).Env(...).Build()` for shell commands.

### 2. Runners (like `doc-mkdocs`, `go` lint, `pnpm`, `nix` image)

- Create `pkg/runner/<name>/` with a runner implementing `runner.IRunner` (must have `ID()` and `Run(ctx runner.IContext)`).
- Register in `pkg/runner/<name>/register.go` using `factory.Register(id, RunnerData{...})` and `factory.RegisterToKey(stage, name, id)`.
- Wire in `pkg/runner/register.go`: call your `Register(...)` from `RegisterAll()`.
- Reference from `.component.yaml` via `runner: <name>` or `runnerID: <full-id>`.
- Runner IDs follow `hackagon::<description>` convention (e.g. `hackagon::lint-go`, `hackagon::doc-mkdocs`).

## Component System

- `.component.yaml` defines per-component targets with stages (`build`, `lint`, `test`, `image`, `aux`).
- Backend: `components/backend/.component.yaml` -- Go build/lint/test + Nix image.
- Frontend: `components/frontend/.component.yaml` -- node-pnpm + git-diff + Nix image.
- Quitsh itself: `tools/quitsh/.component.yaml`.

## Invocation

- Dev shell provides `quitsh-direct` (runs via `just -f tools/quitsh/justfile run`).
- Root justfile aliases: `just lint`, `just build`, `just test` delegate to `just quitsh <stage>`.
- Component justfiles: `just quitsh <stage> --component-dir "$(pwd)"`.

## Key Upstream Imports

- `github.com/sdsc-ordes/quitsh/pkg/cli` -- CLI framework
- `github.com/sdsc-ordes/quitsh/pkg/dag` -- DAG execution for runners
- `github.com/sdsc-ordes/quitsh/pkg/runner/factory` -- runner registration
- `github.com/sdsc-ordes/quitsh/pkg/component/stage` -- stage definitions
- `github.com/sdsc-ordes/quitsh/pkg/toolchain` -- Nix toolchain dispatch
- `github.com/sdsc-ordes/quitsh/pkg/exec` -- command execution (`NewCmdCtxBuilder`)
- `github.com/sdsc-ordes/quitsh/pkg/exec/git` -- Git context (`NewCtxAtRoot`)
- `github.com/sdsc-ordes/quitsh/pkg/log` -- structured logging
