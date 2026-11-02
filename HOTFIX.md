# Hotfixing to the current release branch

## Release branch

For the release that is currently on Prod a release branch is kept: `release/0.x`. It corresponds
to the repository at tag `0.x.0`.

## Hotfixes

Hotfixes are tagged `0.x.1`, `0.x.2`, etc.

For each hotfix an image maust be generated as `release/frontend-service:0.x.1`, `release/frontend-service:0.x.2`, etc. Once the image is there it can be deployed to dev and then to prod.

## Order of steps:

### Make the hotfix

Check out the release branch `release/0.x`. It should contain all previous hotfix tags.

Make the fix on a `hotfix/some-fix` branch and also add a changelog entry.

### Test the hotfix

Consider that thedb schema might have changed and that you have to reset the db in order to test the hotfix.

### Merge the hotfix

Open a PR: to merge the hotix. In the PR: change the helm chart: `helm-chart/Chart.yaml`:
from `version: 0.y.n` and `appVersion: "0.x.n"`
to  `version: 0.y.n+1` and `appVersion: "0.x.n+1"`.
Merge the PR.

Then `just version::bump patch`. And  `just version::check`. Versions should now all be on `0.x.n+1`

Push the tag:

`git push && git push origin v0.x.n+1`.

The images should build now.

### Bring the change to main:

Open a branch to main and cherry pick the hotfix onto that branch. Opn a PR and merge into `main`.                    |
