# Hotfixing the 0.12 line

This branch, `release/0.12`, is what prod runs. A fix prod cannot wait for goes
here, is released as the next patch, and is then brought back to `main`.
Anything that can wait for the next minor release is an ordinary pull request
into `main` instead.

This is the protocol `v0.12.2` was released with, written down with what went
wrong on the way. Every step is by hand on this branch; `main` is getting `just`
recipes that do the checks for you, but a release line only has them once it is
cut after they land.

The examples release `v0.12.3` with chart `0.8.3`. Read the real numbers off the
branch before you start:

```bash
cat VERSION                                             # the release prod runs
grep -E '^(version|appVersion):' helm-chart/Chart.yaml  # the chart that deploys it
```

The next release is `VERSION` plus one patch; the chart's `version` goes up one
patch too.

## The protocol

### 1. Branch from the release branch

```bash
git fetch origin
git switch --no-track -c hotfix/<name> origin/release/0.12
```

Never commit on your local `release/0.12`. The pull request is squash-merged
into a different commit, and your local branch then diverges from GitHub's.

### 2. Start from a fresh local stack

This branch is behind `main`, with a different DB schema and different
dependencies. Migrations only ever add, so a database `main` migrated can break
this branch's code in ways that look like the bug, or hide it. Start over:

```bash
just clean::state       # stops everything, wipes Postgres and Keycloak
just start              # syncs deps, starts the stack, attaches — leave it running
```

Then, in a second terminal, once Postgres is up:

```bash
just db::seed
just deploy::down && just deploy::up   # the backend loads its roles at startup
just deploy::attach                    # the process-compose screen again
```

The restart matters: until the backend restarts, it has not seen the roles the
seed wrote, and `alice` is refused her own hackathon. Do the same when you
switch back to `main`.

### 3. Fix it, in one pull request into `release/0.12`

The pull request carries three things:

- the fix,
- its line under `[Unreleased]` → `### Fixed` in `CHANGELOG.md`, written for
  someone who uses the platform,
- the chart bump for the release it becomes, in `helm-chart/Chart.yaml`:
  `version: 0.8.3` and `appVersion: "0.12.3"`.

The chart bump belongs here. On a release branch only a tag publishes anything,
so the chart has to be in the commit that gets tagged — if it is missing, the
tag builds images that no chart points at. If a fix merged before yours already
bumped the chart for `0.12.3`, leave it: both fixes ship in that one release.

```bash
git push -u origin hotfix/<name>
```

Open the pull request against `release/0.12`:
`https://github.com/SwissDataScienceCenter/hackagon/compare/release/0.12...hotfix/<name>?expand=1`.
**GitHub suggests `main`; that is the wrong base.** Merge once CI is green.

### 4. Check before releasing

```bash
git switch release/0.12 && git pull --ff-only
git status -sb                # clean, no [ahead] or [behind]
cat VERSION                   # 0.12.2, so this releases 0.12.3
grep -E '^(version|appVersion):' helm-chart/Chart.yaml   # 0.8.3 and "0.12.3"
sed -n '/^## \[Unreleased\]/,/^## \[0/p' CHANGELOG.md     # your line under ### Fixed
git tag -l v0.12.3            # nothing
```

If `git pull` refuses because the branches diverged, see the table below. If the
chart is not bumped, do not release: merge a pull request with only the chart
bump first (that is what #393 was for `v0.12.2`).

### 5. Release

```bash
just version::bump patch
git show                      # read the release commit before it leaves
git push && git push origin v0.12.3
```

In `git show`: `VERSION`, both `components/*/.component.yaml` and
`components/frontend/package.json` say `0.12.3`, and your changelog line sits
under `[0.12.3]`. Until you push, a wrong release is undone with:

```bash
git reset --hard origin/release/0.12
git tag -d v0.12.3
```

After pushing it is not undone — see the table below.

### 6. Watch the tag's pipeline

On GitHub's Actions page, the tag runs `ci`, then `images`, then
`publish-chart`. Only when `publish-chart` is green are
`release/backend-service:0.12.3`, `release/frontend-service:0.12.3` and chart
`0.8.3` published. The package pages lag behind; watch the pipeline.

### 7. Deploy to prod

Publishing a chart is not deploying it. Install chart `0.8.3` through the GitOps
setup in `sdsc-ordes/cloud-infra`. Prod is done when the app's footer reads
`v0.12.3`; then check the bug itself.

### 8. Bring the fix to `main`

Otherwise the next minor release, cut from `main`, brings the bug back. Pick the
commit your pull request became on `release/0.12` — the squash commit, not the
release commit above it:

```bash
git log --oneline origin/release/0.12 -3
git switch --no-track -c fix/<name> origin/main
git cherry-pick --no-commit <fix commit>
git restore --source=origin/main --staged --worktree -- \
  VERSION helm-chart/Chart.yaml components/backend/.component.yaml \
  components/frontend/.component.yaml components/frontend/package.json
```

The restore keeps `main`'s own version numbers and chart: the chart bump in the
fix commit belongs to this release line and must never reach `main`.
`CHANGELOG.md` usually conflicts — keep the entry, under `main`'s own
`[Unreleased]`, then `git add CHANGELOG.md`. Then:

```bash
git diff --cached             # only the fix
git commit -c <fix commit>    # reuses its message
git push -u origin fix/<name>
```

and open the pull request into `main`.

### 9. Restart dev

Dev follows `main`, so it has the fix once that pull request is merged and its
pipeline is green — but only after a restart. `pullPolicy: Always` pulls when a
container starts, never on its own:

```bash
kubectl rollout restart deploy/hackagon-backend deploy/hackagon-frontend
```

### 10. Clean up

Delete `hotfix/<name>` and `fix/<name>`, locally and on GitHub.

## What can go wrong

| Symptom                                                                                                              | Cause                                                                                                         | What to do                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locally, after switching branches: unknown columns, 500s, owners refused their own hackathon, frontend import errors | The database, the seeded roles or `node_modules` still belong to the other branch                             | Step 2                                                                                                                                                                |
| The hotfix pull request shows hundreds of commits                                                                    | Its base is `main`, GitHub's default                                                                          | Change the base to `release/0.12`                                                                                                                                     |
| The fix is merged but `Chart.yaml` still has the old `appVersion`                                                    | The chart bump was left out of the pull request                                                               | A pull request into `release/0.12` with only the chart bump, merged before releasing. Never tag first: the tag would publish no chart, and only a further patch could |
| `git pull --ff-only` refuses: diverged                                                                               | A commit made on the local `release/0.12`, then merged through a pull request as a different, squashed commit | Check nothing local is lost, then `git reset --hard origin/release/0.12`                                                                                              |
| A wrong release commit or tag, already pushed                                                                        | Pushed without reading `git show`                                                                             | A release image is never overwritten, so neither re-tag nor delete the tag. Fix forward with the next patch                                                           |
| The tag's pipeline fails                                                                                             | Often a one-off in CI: `v0.12.2` failed its codegen check once, and passed on a re-run of the same commit     | Read the failed step's log. If the same commit passes locally and elsewhere, "Re-run failed jobs" on that run. Never re-tag                                           |
| `publish-chart` skipped "no images yet"                                                                              | It ran before the images existed                                                                              | Re-run it once `images` is green                                                                                                                                      |
| The image page still shows the old version                                                                           | The pipeline is still running; `images` waits for `ci`                                                        | Watch the pipeline, not the package page                                                                                                                              |
| Prod still has the bug, pipeline green                                                                               | Publishing a chart does not deploy it                                                                         | Step 7                                                                                                                                                                |
| Dev still has the bug                                                                                                | The fix is not on `main` yet, or dev has not restarted since                                                  | Step 8, then step 9                                                                                                                                                   |
| `just version::bump patch` on `main` fails: tag already exists                                                       | The hotfix took the next patch number, and `main`'s `VERSION` still holds the old one                         | `main`'s next release is a `minor`                                                                                                                                    |
