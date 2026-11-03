# feat(frontend): filter the admin user list by platform role

As a platform admin, I want to see just the admins, just the hackathon
organizers, or just the people who hold no platform role yet. Then I can check
who holds the keys to the platform, and find whoever is still waiting for a
role, without scrolling the whole list.

**Before:** the Users page had only a free-text search. Typing "admin" happened
to match the Admin badge, but it also matched anyone with "admin" in their
username (such as `hackagon-admin`). There was no way to list the users who hold
no platform role.

**Now:** a row of buttons above the list narrows it to one group, and each
button shows how many users it covers. It works together with the search.

## What changed, page by page

### Users — `/manage/users` (platform admins only)

- **New role filter.** A row of chips sits between the role legend and the list:
  `All · Admin · Hackathon Organizer · No platform role`. Each chip shows a
  count. You pick one at a time, because a user holds at most one of these
  roles.
- **"Platform role" wording.** The column is now "Platform role", the legend has
  a "Platform roles" heading, and the note under it says that roles inside a
  hackathon (owner, member) are separate and not shown here. Before, a user who
  owns a hackathon could look as if they had no role at all.
- **Combines with the search.** A row is shown only if it matches both the
  search and the selected chip. The chip counts are taken within the current
  search, so each count is exactly how many rows that chip would show.
- **Count line under the title** now says what is narrowing the list: "3 of 12
  users match your search", "… your filter" or "… your filters". With nothing
  narrowing it, it still reads "12 users registered on the platform".
- **Empty state** names the filter instead of always quoting the search. For
  example: "No Admin users.", "No users without a platform role." or "No
  Hackathon Organizer users match “bob”."
- Both layouts get the filter: the desktop table and the phone card view.

No other page changes. The dashboard's own role badges use the same helper file,
but their behavior is unchanged.

## Details

- **"No platform role"** means the user holds no platform role at all. They may
  still own or take part in hackathons. That is the same rule the page uses to
  decide when to show the "Grant a role…" picker, so the filter lists exactly
  the rows that have one.
- **A user holding both roles** (only possible if both were granted directly
  through the API) shows up under each.
- **A user holding only a role this build doesn't recognize** shows up only
  under "All". Their row already shows an "Unknown" badge.
- **The filter isn't saved in the page address**, the same as the search next to
  it. It survives granting or revoking a role, but not a full page reload.
- **Revoking under a filter:** if you filter to a role and revoke it from
  someone, their row leaves the filtered list. The "Revoked …" message at the
  top of the page confirms the change.
- **Code:** the matching rules live in
  `components/frontend/src/lib/utils/globalRole.ts`, next to the role labels
  they build on, with unit tests in `globalRole.test.ts`.
- **`CHANGELOG.md`** has a new line under `[Unreleased]` → Added.

## Deliberately left out

- **Server-side filtering.** `UserService.List` takes no parameters and the page
  already loads every user in one request, so filtering in the browser is enough
  at this size. No backend or API change.
- **A shareable filtered link** (`?role=admin`). It would behave differently
  from the search box beside it. It's easy to add later if links like that are
  wanted.

## Verified

- Formatting (`treefmt`), lint (`eslint` + `tsc --noEmit`) and the frontend unit
  tests pass, including the new tests for the matching rules.
- **Not checked in a browser.** No screenshots were taken of either the desktop
  or the phone layout.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
