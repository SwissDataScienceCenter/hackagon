# Audience measurement

Self-hosted [Plausible](https://plausible.io) Community Edition, counting page
views per SCREEN. It answers one question nothing else here can: **is this page
used at all.** The RPC journal (`docs/backend/rpc-journal.md`) records calls,
and a page whose whole job is to be read — the About page, a hackathon's news
tab, the prize table — makes no calls. Session replay
(`docs/frontend/session-replay.md`) records one browser at a time and is a
debugging instrument, not a counter.

**OFF unless a deployment says otherwise.** No `plausible:` block in
`config.yaml` means no script tag, no request, and nothing in the console. The
dev rig that runs one is
`.claude/skills/plausible-stack/` — see its SKILL.md.

## What leaves the browser

One POST per page view (plus an `engagement` event when the tab is hidden or
blurred, carrying the same page and a scroll depth), to the Plausible instance:

| field | value | |
| --- | --- | --- |
| `u` | `https://<origin>/my/hackathon/[id]/teams` | the ROUTE TEMPLATE, never the URL |
| `d` | `hackagon.test` | which site to count it against |
| `r` | `https://github.com` or empty | the referrer's ORIGIN, never its path |
| `w` | `1280` | viewport width |
| `n` | `pageview` / `engagement` | |

No cookie. No `localStorage`. No identifier of any kind is created in, stored
in, or read from the visitor's browser — which is the property that makes this
different from almost every other analytics product, and the reason it was
chosen.

### The URL is never sent, and that is structural

`components/frontend/src/lib/utils/analyticsRoute.ts` builds `u` from
SvelteKit's **route id** — `/(app)/my/hackathon/[id]/teams` — not from the
address bar. The string therefore cannot contain an id, because it never
touched one:

- `/invite/<token>` is reported as `/invite/[token]`. That token IS a
  credential (`hooks.server.ts` makes the route public precisely because the
  URL authenticates the visitor), and an analytics database is not a place for
  working keys.
- `/hackathon/<uuid>` is reported as `/hackathon/[id]`.
- Query strings are dropped entirely, so `utm_*` campaign parameters are never
  recorded either.

A regex scrubber over the real path was the obvious alternative and is strictly
worse: it has to enumerate what a secret looks like, so a route added next month
leaks until somebody remembers to extend the pattern. This is the same failure
mode as per-field masking opt-in, which is why session replay is default-deny.

**The cost is real and is accepted:** Plausible can say the teams screen was
opened 40 times and can never say for which hackathon. Per-event numbers would
mean putting event ids into an aggregate store; the backend's own data answers
"what happened at event X".

The referrer is handled the same way: an internal referrer is dropped (it is
one of our own paths, so it carries exactly the ids above — and Plausible
discards same-site referrers when computing sources anyway), and an external
one is reduced to its origin.

## What Plausible does with the request

Say this plainly, because "cookieless" is often read as "collects nothing":

**Plausible sees the visitor's IP address and user agent, and hashes them.** To
count one person twice in a day without an identifier in the browser, the
server computes

```
user_id = hash(daily_salt, ip_address, user_agent, site_domain)
```

and stores **only the hash**. The salt lives in Postgres (`public.salts`) and
rotates every day, so the same person is a different number tomorrow and the
hash cannot be re-derived from a captured IP later.

This is verified against the schema, not the vendor's page: in
`plausible_events_db`, `events_v2` and `sessions_v2` have a `user_id UInt64`
and **no column of any kind that could hold an IP or a user agent** —
`verify.sh` asks `system.columns` on every run.

The IP is still **processed in transit**, and that is a legitimate-interest
processing decision a deployment makes, not something this document can wave
away. What it is not is storage on, or access to, the visitor's device — the
thing ePrivacy requires consent for.

Geolocation: this rig ships **no** MaxMind/GeoNames database
(`IP_GEOLOCATION_DB` unset), so `country_code`, `region` and `city` stay empty.
A deployment that adds one starts deriving coarse location from that IP; that
would be a new decision, and it belongs in this file.

## Consent: outside the replay banner, deliberately

The session-replay banner asks one question, in its own words: **may we record
your session.** Consent is scoped to what was asked, so reusing that answer to
authorise a second, different collection would be helping ourselves to a
permission nobody gave. (The same argument, in the other direction, is why
replay consent could not reuse the registration consents —
`$lib/utils/replayConsent`.)

The alternatives were weighed rather than defaulted:

- **Behind the existing banner.** Wrong question, and it would also make the
  numbers a function of who clicked yes — a "usage" figure that mostly measures
  banner behaviour is worse than no figure.
- **A second banner.** Two asks on a first visit, one of which has nothing to
  ask about: there is no artefact in the browser to permit or to withdraw.
- **Outside the gate, stated in this document.** Chosen. It is honest only
  because of the properties above — nothing stored in the browser, no URL, no
  identity — and it stops being the right answer the moment any of them change.

What the visitor's own signal still does: **`DNT: 1` or Global Privacy Control
suppresses the script entirely**, checked before it is fetched, so the request
for the script is not made either. GPC is included because it is the signal
with legal weight in several jurisdictions and Plausible's script does not look
at it.

## Not correlated with anything

`tracker.setUserID()` has no equivalent here and no user id, session id or
replay id is ever sent. Nothing joins these counts to a person's rows, to their
line in the RPC journal, or to a replay session — the same rule the journal and
the replay tracker already keep between themselves. Joining them is an owner's
decision to make explicitly, never a default to drift into.

## Turning it on

```bash
bash .claude/skills/plausible-stack/scripts/up.sh            # the instance, behind a quick tunnel
bash .claude/skills/plausible-stack/scripts/wire-frontend.sh # point the app at it
bash .claude/skills/plausible-stack/scripts/verify.sh        # prove a page view lands
bash .claude/skills/plausible-stack/scripts/wire-frontend.sh --restore
```

Wiring writes `config.local.yaml` — the gitignored overlay — never the tracked
`config.yaml`, which must keep saying `localhost`.

The tracker script must be the **`local.manual`** variant: `local` because the
stock script silently refuses to send from `localhost`, and `manual` because
the stock script otherwise sends `location.href` by itself, which is the one
thing this integration exists to prevent.

## None of this is claimed, it is asserted

| Claim | What checks it |
| --- | --- |
| no id or token on the wire | `plausible-stack/scripts/pageview.mjs` — a real Firefox, greping the captured POST bodies for the UUID and the token it just visited |
| the route template IS sent (the positive control) | same script: an absence-assertion with nothing to assert about passes for the wrong reason |
| Plausible stored the template, not an id | `verify.sh` step 7 — Plausible's own Stats API, not a peek into ClickHouse |
| no column can hold an IP | `verify.sh` step 8 — `system.columns` |
| absent config ⇒ absent script | run `pageview.mjs` unwired: zero requests leave the browser |
| the route→path mapping | `src/lib/utils/analyticsRoute.test.ts`, every absence case paired with a positive control |
