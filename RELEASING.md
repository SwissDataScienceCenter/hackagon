# Releasing Hackagon

This documents how a change gets from a pull request to a running app: which
version number moves, what a merge already does on its own, and which steps a
person has to decide.

The mechanics of the pipeline itself — stages, image registries, caching — are
in [.github/ci-cd.md](.github/ci-cd.md). This file is the process on top of
them.

## Branches

`main` is the only long-lived branch. Work happens on a short-lived branch —
`feat/…`, `fix/…`, `docs/…`, `chore/…` — and merges into `main` through a pull
request, with its changelog entry in the same pull request.

There is no integration branch. One focused pull request per change, reviewed
and merged on its own, is what keeps the history readable and the changelog
honest.

A pull request runs the full CI suite: codegen drift, lint, version consistency,
chart lint, build, tests, and an image build. That is the only gate in front of
`main` which matters for the reason below.

## Deployment

There are two deployments. Only one of them exists today.

### The temporary one — <https://app.hackagon.dev.renku.ch>

It runs `temporary/*:latest` with `imagePullPolicy: Always`. Every push to
`main` rebuilds that tag, so this site serves whatever was merged last — from
the next container restart onwards.

```
merge to main ──► CI rebuilds temporary/*:latest ──► next container restart
                                                     serves the new code
```

A restart is not always something you chose: an eviction or a node drain
restarts the container too. To restart it on purpose:

```bash
kubectl rollout restart deploy/hackagon-frontend
```

To see which build it is serving, read the version at the bottom of the page.

Every push also publishes an immutable tag beside `latest` — the version plus
the first 12 characters of the commit, e.g. `0.8.0-efc7c9ace429`. `latest` gets
overwritten; those never do, so a specific build can be pinned:

```bash
--set frontend.image.tag=0.8.0-efc7c9ace429
--set frontend.image.pullPolicy=IfNotPresent
```

`skopeo list-tags docker://<repository>` shows which tags exist.

### The real one — not set up yet

dev and prod will be installed from the Helm chart, which names the app release
it deploys in `appVersion`. Such a deployment ignores `latest` completely and
changes only when someone installs a new chart version. How it will be set up is
not decided yet, so this file does not describe it.

## Three version numbers

Two of them are the app, one is the chart, and they move independently. Read
[.github/ci-cd.md](.github/ci-cd.md#two-release-trains) for why.

| Number             | Lives in                 | Moved by             | Means                                  |
| ------------------ | ------------------------ | -------------------- | -------------------------------------- |
| App version        | `VERSION` (+ mirrors)    | `just version::bump` | The app release. Becomes the image tag |
| Chart version      | `Chart.yaml: version`    | By hand              | The chart's own release                |
| Chart `appVersion` | `Chart.yaml: appVersion` | By hand              | The app release a cluster will run     |

`VERSION` is mirrored into both `components/*/.component.yaml` files and
`components/frontend/package.json`, because a component version _is_ its
published image tag. CI fails a tree where they disagree, so always move them
with `just version::bump` rather than by hand.

That check exists because the drift is real and silent: an image tagged `0.7.0`
whose footer reads `v0.1.0` came from a tree where those two files disagreed,
and nothing complained at the time.

## Writing the changelog

Add the entry in the same pull request that makes the change, under
`## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md). One line, in the language a
user of the platform would use — what they can now do, not which function
changed. A refactor, a test or a CI tweak needs no entry.

`just version::bump` lifts whatever sits under `[Unreleased]` into a heading for
the version being cut, dates it, and leaves `[Unreleased]` empty again. So the
release notes for a version are exactly what was written while it was being
built — nobody reconstructs them afterwards from the commit log. If nobody wrote
anything, `bump` says so in its summary and releases anyway.

Concurrent pull requests both appending under `[Unreleased]` will conflict on
those lines. The conflict is trivial to resolve — keep both entries — and is the
price of a file anyone can read without tooling.

## Cutting an app release

From an up-to-date, clean `main`:

```bash
just version::check           # the versions already agree
just version::bump minor      # or patch / major
git show                      # read the release commit before it leaves
git push && git push origin v0.9.0
```

`bump` refuses a dirty tree, edits every version file, rolls the changelog,
commits as `chore(release): v0.9.0` and creates the annotated tag. It pushes
nothing — it prints the two `git push` commands so the release is never a side
effect of running it.

Pushing the tag builds and pushes `release/backend-service:0.9.0` and
`release/frontend-service:0.9.0`. A release image is never overwritten, so a
botched tag is fixed by bumping again, not by re-tagging.

If `main` has moved past something you cannot ship and a released version needs
a fix, branch from the tag rather than from `main`:

```bash
git switch -c hotfix/thing v0.8.0
```

Open the pull request against `main` if the fix belongs there too. Create such a
branch when a fix actually needs one — not in advance.

## Making a release deployable

A tagged release is not installable from the chart until the chart points at it.
That means two hand-edited numbers in `helm-chart/Chart.yaml`:

```yaml
version: 0.3.0 # the chart's own release — bump it, CI checks that you did
appVersion: "0.9.0" # the app release this chart deploys
```

CI wants that `version` bump for _any_ change under `helm-chart/`, comments
included. On merge, `just helm::publish` pushes the chart to
`oci://ghcr.io/swissdatasciencecenter/hackagon/charts/hackagon`, and skips
without failing when the version is already published or when `appVersion` has
no images yet.

Publishing a chart is not deploying it. Once a real deployment exists,
installing that chart version is the step that changes what runs.

## A first release checklist

Worth knowing once, then never again:

- **New GHCR packages are private by default.** The first `v*` tag creates the
  `release/*` packages and the first chart publish creates `charts/hackagon`.
  Until someone sets them public in the org's package settings, a cluster needs
  an `imagePullSecret`. The `temporary/*` packages are already public.
- **The chart cannot render with its own defaults.** Several values — admin id,
  passwords, hostnames — are intentionally empty. `just helm::lint` renders it
  against [tools/helm/lint-values.yaml](tools/helm/lint-values.yaml), which
  exists only so the chart can be linted in CI. It is not a deployment example.
