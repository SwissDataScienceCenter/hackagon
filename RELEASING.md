# Releasing Hackagon

This documents how a change gets from a pull request to a running app: which
version number moves, what a merge already does on its own, and which steps a
person has to decide.

The mechanics of the pipeline itself — stages, image registries, caching — are
in [.github/ci-cd.md](.github/ci-cd.md). This file is the process on top of
them.

## Branches

```
main ──●──●──●──●──●──●──●──●──●──►   development; dev follows it
          │
          v0.12.1 + its chart bump
          │
          └── release/0.12 ──●── v0.12.2 ──●── v0.12.3   hotfixes only; prod runs these tags
                             ▲
                         hotfix/… PRs
```

`main` is where development happens. Work happens on a short-lived branch —
`feat/…`, `fix/…`, `docs/…`, `chore/…` — and merges into `main` through a pull
request, with its changelog entry in the same pull request. One focused pull
request per change, reviewed and merged on its own, is what keeps the history
readable and the changelog honest.

`release/X.Y` is one branch per released minor line, created when that line is
released ([Making an app release](#making-an-app-release)). It never receives
features, only the fixes that prod cannot wait for — see
[Making a hotfix](#making-a-hotfix). Its tags (`v0.12.2`, `v0.12.3`, …) are what
prod runs. Once the next minor line is released, the old branch simply stops
being used and can be deleted once the new release has been deployed to
production.

So `main` can keep moving during a hackathon while prod stays on the release it
was installed with, and a hotfix for prod can be done on `release/X.Y`.

A pull request runs the full CI suite, whichever branch it targets: codegen
drift, lint, version consistency, chart lint, build, tests, and an image build.
That is the only gate in front of `main` and `release/*`. A push to `release/*`
itself builds nothing; only its tags do.

## Deployment

Two clusters, both installed from the Helm chart by the GitOps setup in
`sdsc-ordes/cloud-infra` — a base `values.yaml` plus per-cluster overrides. The
only thing that differs between them is which images they pull.

| Cluster | Images                                       | Moves when                       |
| ------- | -------------------------------------------- | -------------------------------- |
| dev     | `temporary/*:latest`, `pullPolicy: Always`   | anything is merged to `main`     |
| prod    | chart defaults — `release/*` at `appVersion` | a new chart version is installed |

### dev follows `main`

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

`pullPolicy: Always` is what makes this work. The chart defaults to
`IfNotPresent`, which never re-pulls a moving tag — the node would keep serving
the image it first fetched.

Every push also publishes an immutable tag beside `latest` — the version plus
the first 12 characters of the commit, e.g. `0.9.1-848209cd2c52`. `latest` gets
overwritten; those never do, so a specific build can be pinned:

```bash
--set frontend.image.tag=0.9.1-848209cd2c52
--set frontend.image.pullPolicy=IfNotPresent
```

`skopeo list-tags docker://<repository>` shows which tags exist.

### prod follows releases

No image overrides at all. With `tag: ""` the chart falls back to `appVersion`,
and release builds tag their images with the bare version, so
`appVersion: "0.9.1"` resolves to `release/backend-service:0.9.1` — an image
that exists because a `v*` tag built it.

Nothing merged to `main` can reach prod. It changes only when someone bumps
`appVersion`, publishes the chart, and installs that chart version.

While a hackathon is running on prod, install nothing there except hotfixes in
case the event needs them.

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

## Making an app release

From an up-to-date, clean `main`:

```bash
just version::check           # the versions already agree
just version::bump minor      # patch / minor / major — always say which
git show                      # read the release commit before it leaves
git push && git push origin v0.9.0
```

`bump` refuses a dirty tree, edits every version file, rolls the changelog,
commits as `chore(release): v0.9.0` and creates the annotated tag. It pushes
nothing — it prints the two `git push` commands so the release is never a side
effect of running it.

Name the bump every time. With no argument `bump` defaults to a `patch` and the
first place it tells you which one it chose is the commit it has already made.

Pushing the tag builds and pushes `release/backend-service:0.9.0` and
`release/frontend-service:0.9.0`. A release image is never overwritten, so a
botched tag is fixed by bumping again, not by re-tagging.

Then [make the release deployable](#making-a-release-deployable). Once that
chart pull request is merged, create the release branch from its merge commit —
not from the tag, which does not have the chart bump yet. `main` may have moved
on in the meantime, so name the commit:

```bash
git fetch origin
git switch -c release/0.9 <merge commit of the chart pull request>
git push -u origin release/0.9
```

### If you bumped the wrong way

`bump` commits and tags locally and pushes nothing, so a release you have not
pushed yet is thrown away without anybody else learning of it:

```bash
git reset --hard origin/main
git tag -d v0.9.0
```

## Making a hotfix

A hotfix goes on the release branch prod runs, never through `main`. Take
`release/0.12` and a fix that becomes `v0.12.2`:

1. **Branch from the release branch**, not from `main`:

   ```bash
   git fetch origin
   git switch -c hotfix/thing origin/release/0.12
   ```

2. **Fix it, in one pull request into `release/0.12`** — set that as the base;
   GitHub suggests `main`. The pull request carries:
   - the fix itself,
   - its line under `[Unreleased]` → `### Fixed` in `CHANGELOG.md`,
   - the chart bump for the release it will become: `Chart.yaml` `version` up
     one patch, `appVersion: "0.12.2"`.

   The chart bump belongs here, not in a pull request afterwards: CI publishes
   charts only for pushes to `main` and for tags, so on a release branch the
   chart has to be in the commit that gets tagged.

3. **Release it from the release branch**, once the pull request is merged:

   ```bash
   git switch release/0.12 && git pull
   just version::bump patch
   git show                      # read the release commit before it leaves
   git push && git push origin v0.12.2
   ```

   The tag builds `release/*:0.12.2`, then publishes the chart from the tagged
   commit. Installing that chart version on prod is what ships the fix. A wrong
   bump is undone as [above](#if-you-bumped-the-wrong-way), resetting to
   `origin/release/0.12` instead of `origin/main`.

4. **Bring the fix to `main`**, or the next minor release brings the bug back.
   Cherry-pick the fix commit onto a new branch and open a pull request into
   `main`:

   ```bash
   git switch -c fix/thing origin/main
   git cherry-pick --no-commit <fix commit>
   git restore --source=origin/main --staged --worktree helm-chart/Chart.yaml
   git commit
   ```

   Pick only the fix. The hotfix commit also carries the release's chart bump,
   which is why `Chart.yaml` is put back to `main`'s before committing; merging
   the release branch into `main` would bring its release commits and changelog
   headings as well. `CHANGELOG.md` will conflict: keep the entry, under
   `main`'s own `[Unreleased]`.

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

`main` and a release branch both publish charts, so they must never pick the
same number. A release line keeps the chart patch versions of its release —
`release/0.12` started at chart `0.8.1` and goes on with `0.8.2`, `0.8.3`. On
`main`, the first chart change after cutting a release branch moves the chart to
the next minor (`0.9.0`).

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
