# Hotfixing to the current release branch

The branch model, deployment and changelog rules are in
[RELEASING.md](RELEASING.md). This is only the hotfix protocol.

## Release branch

For the release that is currently on Prod a release branch is kept:
`release/0.x`. It starts at tag `v0.x.0`.

## Hotfixes

Hotfixes are tagged `v0.x.1`, `v0.x.2`, etc.

For each hotfix tag, images are built as `release/backend-service:0.x.1` and
`release/frontend-service:0.x.1`, etc. Once the images are there, the chart can
be installed on staging and then on prod. Dev does not run release images — it
follows `main` (see [RELEASING.md](RELEASING.md#dev-follows-main)).

## Order of steps:

### Make the hotfix

Check out the release branch `release/0.x`. It should contain all previous
hotfix tags.

Make the fix on a `hotfix/some-fix` branch and also add a changelog entry.

### Test the hotfix

Consider that the db schema might have changed and that you have to reset the db
in order to test the hotfix.

### Merge the hotfix

Open a PR to merge the hotfix into `release/0.x` — not into `main`, which GitHub
suggests. In the PR, add a second commit that only changes the helm chart
`helm-chart/Chart.yaml`: from `version: 0.y.m` and `appVersion: "0.x.n"` to
`version: 0.y.m+1` and `appVersion: "0.x.n+1"`. Merge the PR with "Rebase and
merge", not "Squash and merge", so the two commits stay separate.

The chart bump belongs in this PR, not in one afterwards: on a release branch CI
publishes the chart only from tags, so it has to be in the commit that gets
tagged.

Then update your local release branch, so the release contains the fix:

`git switch release/0.x && git pull --ff-only`

Then `just version::bump patch`. Versions should now all be on `0.x.n+1`.

Push the tag:

`git push && git push origin v0.x.n+1`.

A wrong bump is undone as in
[If you bumped the wrong way](RELEASING.md#if-you-bumped-the-wrong-way), but
resetting to `origin/release/0.x` instead of `origin/main`.

The images and the chart should build now. Install the new chart version on prod.

### Bring the change to main:

Open a branch from `main` and cherry pick only the fix commit onto that branch,
not the helm chart commit. `CHANGELOG.md` will conflict: keep the entry, under
`main`'s own `[Unreleased]`. Open a PR and merge into `main`. Dev gets the fix
after its next restart.
