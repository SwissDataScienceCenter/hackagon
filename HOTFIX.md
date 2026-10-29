# Hotfixing a release

A hotfix is a fix that prod cannot wait for. It goes onto the release branch
prod runs, is released from there as the next patch, and is then brought back to
`main`. Anything that can wait for the next minor release is an ordinary pull
request into `main` instead.

The branch model and the version numbers are explained in
[RELEASING.md](RELEASING.md). This file is the protocol, step by step, with the
commands to copy. The examples fix `release/0.12`, where prod runs `v0.12.2`, so
the hotfix becomes `v0.12.3`.

Three `just` recipes carry the error-prone parts, and `just hotfix::help` lists
them:

| Recipe                                 | Does                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `just hotfix::start <name> [line]`     | Branches `hotfix/<name>` from the release branch, commits the chart bump     |
| `just hotfix::check`                   | Fails unless the release branch is ready for `version::bump patch`           |
| `just hotfix::to-main <commit> <name>` | Cherry-picks the fix onto `fix/<name>` from `main`, keeping `main`'s numbers |

`just version::bump` runs `hotfix::check` by itself on a `release/*` branch and
refuses anything but a `patch` there, so the release step cannot skip it.

## The protocol

### 1. Start the hotfix branch

```bash
just hotfix::start results-500          # newest release line
just hotfix::start results-500 0.12     # or name it
```

This branches `hotfix/results-500` from `origin/release/0.12` and commits the
chart bump the release will need — `version` up one patch,
`appVersion: "0.12.3"` — as the branch's first commit. On a release branch only
a tag publishes anything, so the chart has to be in the commit that gets tagged;
putting it in first is what keeps it from being forgotten. If a fix merged
before yours already bumped the chart for `0.12.3`, it says so and commits
nothing: both fixes then ship in that one release.

### 2. Fix it, in one pull request into the release branch

Make the fix, and add its line under `[Unreleased]` → `### Fixed` in
`CHANGELOG.md`, written for someone who uses the platform. Then:

```bash
git push -u origin hotfix/results-500
```

Open the pull request with the link `start` printed — it already has
`release/0.12` as the base. **GitHub suggests `main`; a hotfix pull request into
`main` is the wrong one.** CI runs in full on it. Merge it once it is green.

### 3. Release it

```bash
git switch release/0.12 && git pull
just version::bump patch
git show                      # read the release commit before it leaves
git push && git push origin v0.12.3
```

`bump` first runs `just hotfix::check` and stops, writing nothing, unless all of
these hold:

- the working tree is clean,
- the branch is exactly `origin/release/0.12` — nothing local, nothing missing,
- tag `v0.12.3` does not exist yet,
- `Chart.yaml` has `appVersion: "0.12.3"`,
- the chart `version` is newer than the one `v0.12.2` shipped, and is not
  `main`'s,
- `CHANGELOG.md` has an entry under `[Unreleased]`.

Read `git show` before pushing: `VERSION`, both `.component.yaml` files and
`package.json` say `0.12.3`, and the changelog entry now sits under `[0.12.3]`.
Until you push, a wrong release is undone with:

```bash
git reset --hard origin/release/0.12
git tag -d v0.12.3
```

After pushing it is not undone — see below.

### 4. Watch the tag's pipeline

The tag runs `ci`, then `images`, then `publish-chart`, one after the other, on
GitHub's Actions page. Only when `publish-chart` is green are both
`release/backend-service:0.12.3` and `release/frontend-service:0.12.3` in the
registry and the chart published. The package pages lag behind a running
pipeline; the pipeline is what to watch.

### 5. Deploy to prod

Publishing a chart is not deploying it. Install the new chart version through
the GitOps setup in `sdsc-ordes/cloud-infra`. Prod is done when the footer of
the app reads `v0.12.3`. Then check the bug itself.

### 6. Bring the fix to `main`

Otherwise the next minor release, which is cut from `main`, brings the bug back.
Pick the commit the hotfix pull request became on the release branch — the
squash commit, not the release commit above it:

```bash
git log --oneline origin/release/0.12 -3
just hotfix::to-main <fix commit> results-500
```

This branches `fix/results-500` from `origin/main`, cherry-picks the fix without
committing, and puts `main`'s `VERSION`, component versions and `Chart.yaml`
back — the chart bump in the hotfix commit belongs to the release line, and must
never reach `main`. `CHANGELOG.md` usually conflicts: keep the entry, under
`main`'s own `[Unreleased]`. Then, as `to-main` prints:

```bash
git diff --cached                 # only the fix
git commit -c <fix commit>
git push -u origin fix/results-500
```

and open the pull request into `main`.

### 7. Restart dev

Dev follows `main`, so it has the fix once that pull request is merged and its
pipeline is green — but only after a restart, because `pullPolicy: Always` pulls
when a container starts, never on its own:

```bash
kubectl rollout restart deploy/hackagon-backend deploy/hackagon-frontend
```

### 8. Clean up

Delete `hotfix/results-500` and `fix/results-500`, locally and on GitHub.

## What can go wrong

| Symptom                                                        | Cause                                                                                                          | What to do                                                                                                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The hotfix pull request shows hundreds of commits              | Its base is `main`, GitHub's default                                                                           | Change the base to `release/0.12`                                                                                                                                                   |
| `hotfix::check`: chart `appVersion` is not the next patch      | The chart bump is not on the release branch — the branch was made by hand, or the bump commit was dropped      | A small pull request into `release/0.12` with only the chart bump, merged before releasing. Never tag first: the tag would publish no chart, and only a further patch release could |
| `hotfix::check`: diverged from `origin/release/0.12`           | A commit made on the local release branch, then merged through a pull request as a different (squashed) commit | Check nothing local is lost, then `git reset --hard origin/release/0.12`                                                                                                            |
| `hotfix::check`: commits not on origin                         | Something was committed straight onto the release branch                                                       | Move it to a `hotfix/…` branch and a pull request; reset the release branch to origin                                                                                               |
| `hotfix::check`: `[Unreleased]` is empty                       | The fix's pull request had no changelog entry                                                                  | Add it in a pull request into `release/0.12`                                                                                                                                        |
| `bump` refuses `minor` / `major`                               | A release branch takes patches only                                                                            | Minor and major releases are cut from `main` — see RELEASING.md                                                                                                                     |
| A wrong release commit or tag, already pushed                  | Pushed without reading `git show`                                                                              | A release image is never overwritten, so neither re-tag nor delete the tag. Fix forward with the next patch                                                                         |
| The tag's pipeline fails                                       | Often a one-off in CI: `v0.12.2` failed its codegen check once, and passed on a re-run of the same commit      | Read the failed step's log. If the same commit passed locally and elsewhere, "Re-run failed jobs" on that run. Never re-tag                                                         |
| `publish-chart` skipped "no images yet"                        | It ran before the images existed                                                                               | Re-run it once `images` is green                                                                                                                                                    |
| The image page still shows the old version                     | The pipeline is still running; `images` waits for `ci`                                                         | Watch the pipeline, not the package page                                                                                                                                            |
| Prod still has the bug, pipeline green                         | Publishing a chart does not deploy it                                                                          | Install the chart version in `sdsc-ordes/cloud-infra`                                                                                                                               |
| Dev still has the bug                                          | The fix is not on `main` yet, or dev has not restarted since                                                   | Step 6, then step 7                                                                                                                                                                 |
| `hotfix::to-main`: nothing to bring                            | `main` already has the change, under another hash                                                              | Nothing; the recipe removes the branch it made                                                                                                                                      |
| `just version::bump patch` on `main` fails: tag already exists | The hotfix took the next patch number, and `main`'s `VERSION` still holds the old one                          | `main`'s next release is a `minor`                                                                                                                                                  |
| `just hotfix::…` is unknown on the release branch              | The release line was cut before the recipes existed                                                            | Bring `tools/just/hotfix.just`, the `mod hotfix` line in `justfile` and `version.just` over in a pull request into the release branch; it needs no release of its own               |
