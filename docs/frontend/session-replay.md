# Session replay

A development and analysis tool. When a deployment turns it on **and** a visitor
allows it, the browser streams a recording of the page — the DOM and how it
changed — to an OpenReplay instance, so a control that does nothing can be
watched doing nothing.

**It is off by default, twice**: no `replay:` block in `config.yaml` means the
feature does not exist on that deployment, and no consent from this browser
means nothing is recorded even where it does.

Code: `components/frontend/src/lib/components/observability/` (the tracker and
the consent banner), `src/lib/utils/replayConsent.ts` (what the decision is and
where it is kept), `src/routes/consent/replay/+server.ts` (where it is
recorded). Configuration: `replaySchema` in `src/lib/schemas/config-schema.ts`.

## Why a browser SDK and not the RPC journal

They see different things and neither substitutes for the other.
[`backend/rpc-journal.md`](../backend/rpc-journal.md) records what the server
was **asked to do**. This records what a person **did**. The bug class it exists
for is the click that produces no RPC at all: a button wired to the wrong
handler, a control that swallows its first click before hydration, a page
nothing links to. None of those reach the backend, and that absence is the bug.

The two are deliberately **not correlated**. `tracker.setUserID()` is never
called, `network.sessionTokenHeader` is `false` so no session id is stamped onto
outgoing requests, and no replay or session identifier exists anywhere in the Go
backend or the journal. A recording cannot be joined to a person's rows. Linking
them is an owner's decision to make explicitly, not a default to drift into.

## On whose say-so

|                                     |                                                                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who decides**                     | The person using the browser. Not an organiser, not an admin — there is no setting anywhere that turns recording on for somebody else.                                                                                      |
| **When they are asked**             | On the first page load of a deployment that has replay configured. A banner appears at the bottom of every page until it is answered — pinned to the viewport so it is seen, and taking up its own space at the end of the document so it never covers a control (it was `fixed` once, and the bottom of every page was unclickable for exactly the people who had not answered yet). |
| **What happens before they answer** | Nothing is recorded. The server does not send the browser an ingest endpoint or a project key at all, so there is nothing for the page to start — this is a property of what was transmitted, not of what a script decided. |
| **How to change it**                | `/account` → **Session recording**. Withdrawing takes effect on the same click: the response is a redirect, so the recording page is replaced by one that was never given the tracker's configuration.                      |
| **How long a "yes" lasts**          | 180 days, then the banner returns.                                                                                                                                                                                          |
| **Do Not Track**                    | A browser sending DNT (or Global Privacy Control) is never recorded, even if it has said yes. The tracker SDK is not even downloaded.                                                                                       |

The decision is stored in a first-party, `httpOnly` cookie
(`hackagon_replay_consent`) and **nothing about it reaches the backend**. That
is deliberate on two counts: a script on the page cannot read it or grant itself
permission by writing it, and the one fact that would tie a human being to a
recording never lands in the same database as their hackathon rows.

**It is a browser's permission, not an account's.** OpenReplay records a
browser, so that is the honest scope: allowing it on your laptop has not allowed
it on the shared machine in the lab, and signing out does not withdraw it. The
`/account` copy says "this browser" for that reason.

### Why not a registration consent

`HackathonForms.registration_consents` already models organiser-defined
`{key, label, required}` agreements and `FormResponse.consents` stores the
answers, so `conduct` and `photos` have exactly the machinery a `replay` key
would want. It does not fit:

- **Scope.** A registration consent is an agreement with _one event_, recorded
  against `(hackathon, user)`. The tracker runs on the landing page, the About
  page and invite links — before an event is chosen, and for people who never
  join one. There is no hackathon to scope the row to. The platform already
  states this rule out loud in `/account` and on `user.proto`: agreeing to one
  event's code of conduct is not a standing agreement with the platform.
- **Identity.** A registration consent needs a `User` row, so it cannot exist
  until somebody has signed in _and_ registered — several page loads in. A
  permission that only a logged-in member can give cannot govern a recorder that
  runs before login.
- **Correlation.** Storing it server-side would create exactly the
  person↔recording link the design avoids.

## What is recorded

With consent, from that browser, on every page:

| Recorded                               | Notes                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| The DOM tree and every mutation        | Tag names, class lists, structure, layout                                        |
| Clicks                                 | With the CSS path of the element hit — this is what makes a dead control visible |
| Mouse movement, scrolls, viewport size |                                                                                  |
| Page navigations                       | As events. **Not** as URLs — see below                                           |
| Resource timings                       | The browser's own performance entries                                            |

## What is never recorded

Not "stripped afterwards" — the tracker is configured default-deny, and
`privateMode` obscures every element that does not carry
`data-openreplay-unmask`. Nothing in this app carries it.

- **Nothing anybody typed.** `defaultInputMode: Hidden` — an input's value is
  never transmitted at all, not transmitted-and-starred.
- **No page text.** Every text node arrives as asterisks. That includes names,
  registration answers, dietary requirements and free prose.
- **No console output** (`consoleMethods: []`), **no request or response
  bodies** (`capturePayload: false`), **no headers** (`ignoreHeaders: true`).
- **No identity.** No user id, no email, no session token.
- **No URL paths.** See the next section.

**One hole no option closes**, and it is a review rule rather than a setting:
masking applies to text nodes and input values, while **attribute** values are
transmitted verbatim (only `alt` and `placeholder` are starred, `href` blanked).
`title={userName}` on the nav monogram once shipped a person's full name in
clear while the same name one element away arrived as asterisks. **Personal data
goes in text nodes, never in an attribute.**

### URLs

`privateMode` does wipe the page **location**: the OpenReplay UI shows `****`
for every page of every session. That is not where a URL leaked. The tracker
stamps `document.baseURI` — the full current URL — onto every URL-based DOM
message so the replayer can resolve relative asset paths, and those are not
sanitized. Read out of a real capture: the bytes contained
`http://localhost:8081/register/019fe19a-…` dozens of times while every text
node beside them was asterisks.

Route ids alone would have been arguable. `/invite/<token>` is not: **that token
is the credential** — the invite route is public precisely because the URL
authenticates the visitor — so a recording of somebody opening their invitation
would contain a working key to a private event, readable by anyone with access
to the replay UI. A debugging tool must not become a credential store.

So `resourceBaseHref` is pinned to the site's origin and every URL the tracker
handles is reduced to its origin. Nothing carries a path, a query or a fragment.
The cost is that a relative asset href recorded on a deep route resolves against
`/` in the replayer, so some CSS may not load there — a fair trade, since the
location was already `****` in the UI and the path in those messages was
incidental leakage rather than anything the tool showed anyone.

## Retention

Recordings do not live forever, and OpenReplay's docker-compose distribution has
**no retention setting** (checked in `vendor/docker-envs/*.env` and
`init_ch_schema.sql`; limits are an enterprise feature). So the bound is
scripted:

```bash
bash .claude/skills/openreplay-stack/scripts/retention.sh                  # dry run, 30 days
bash .claude/skills/openreplay-stack/scripts/retention.sh --days 30 --apply
bash .claude/skills/openreplay-stack/scripts/retention.sh --days 30 --apply --install-ttl
```

A session lives in four places and deleting one leaves the others holding the
same visit, so the script deletes all of them: the recording itself
(`mobs/<session_id>/…` in the object store), the Postgres row (~20 event tables
cascade off it), the ClickHouse analytics rows, and — nothing on Hackagon's
side, because by design there is no session id here to clean up. `--install-ttl`
additionally gives ClickHouse a declarative TTL, which it enforces with no cron
but which reaches neither the recordings nor Postgres.

Run it from cron. It is a dry run unless `--apply` is passed.

## Turning it on

`.claude/skills/openreplay-stack` brings up a self-hosted OpenReplay and wires
the frontend:

```bash
bash .claude/skills/openreplay-stack/scripts/up.sh
OPENREPLAY_PROJECT_KEY=… bash .claude/skills/openreplay-stack/scripts/wire-frontend.sh
bash .claude/skills/openreplay-stack/scripts/wire-frontend.sh --restore   # off again
```

That writes into `components/frontend/data/test/config/config.local.yaml` — the
gitignored overlay the loader deep-merges over `config.yaml`, never the tracked
file itself, because the ingest hostname is a Cloudflare quick tunnel that dies
in a few hours and has no business in HEAD:

```yaml
replay:
  enabled: true
  ingestPoint: https://…/ingest
  projectKey: …
  # The tracker refuses to record a page served over plain http. Dev only.
  allowInsecureOrigin: true
```

An absent or incomplete block parses to `{enabled: false}`, so no deployment
starts recording because somebody forgot a flag.

**That overlay has a second writer** — the Cloudflare tunnel's `auth-wire.sh`
owns `oidc` in the same file — so `--restore` removes the `replay` *block*, not
the file. Deleting the file would drop the tunnel's issuer, and a tunnel with no
issuer keeps serving pages: only signing in breaks, which nobody notices until
they try. `.claude/skills/lib/config-overlay.sh` does the per-key edit.

## None of this is claimed, it is asserted

`.claude/skills/hackathon-e2e/tests/openreplay/` — run with
`bash .claude/skills/hackathon-e2e/scripts/run.sh openreplay`. Every test
measures **bytes on the wire**, because "the component checked a variable" is a
statement about our code and "nothing left the browser" is a statement about the
visitor.

| Spec              | Proves                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consent.spec.ts` | A fresh browser records **zero bytes** and is not even sent the project key; clicking _Allow_ in the real banner starts it — the two halves in one run, so the zero cannot be a broken measurement. Withdrawing at `/account` stops it. A DNT browser with consent granted records nothing and never fetches the SDK. The cookie is unreachable from page scripts.                              |
| `masking.spec.ts` | A sentinel typed into the registration form is absent from the captured bytes — preceded by an **unmasked control run** that finds its own sentinel, because a zero-hit grep otherwise reads identically to "nothing was recorded". Also: the signed-in user's display name is absent (the attribute hole), and no page path is present (the URL decision), each with its own positive control. |
