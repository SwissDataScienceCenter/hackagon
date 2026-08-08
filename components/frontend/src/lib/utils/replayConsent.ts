// Consent for session replay.
//
// WHY THIS IS NOT A REGISTRATION CONSENT. `HackathonForms.registration_consents`
// already models organiser-defined `{key,label,required}` agreements, and
// `FormResponse.consents` stores `map<string,bool>` — so `conduct` and `photos`
// have exactly the machinery a `replay` key would want. It does not fit, for
// three reasons that are not stylistic:
//
//  1. SCOPE. A registration consent is an agreement with ONE EVENT, recorded
//     against `(hackathon, user)`. The tracker runs on the landing page, the
//     About page and an invite link — before any event is chosen, and for
//     people who will never join one. There is no hackathon to scope the row
//     to. `/account` already states this rule out loud ("agreeing to one
//     event's code of conduct is not a standing agreement with the platform"),
//     and `user.proto` repeats it on the profile entity.
//  2. IDENTITY. A registration consent needs a `User` row, so it cannot exist
//     until someone has signed in AND registered — which is after several page
//     loads. A consent that can only be given by a logged-in member cannot
//     govern a recorder that runs before login.
//  3. CORRELATION. Storing "this person allows replay" server-side would put
//     the one fact that links a human being to a recording into the same
//     database as their hackathon rows, next to the RPC journal that is
//     deliberately un-joinable to a replay. See SessionReplay.svelte.
//
// So the store is a first-party cookie, and nothing about it reaches the
// backend. That is also the honest scope: OpenReplay records a BROWSER, so the
// permission is a browser's to give and to take back. Someone who allows it on
// their laptop has not allowed it on the shared machine in the lab.
//
// Read server-side in `+layout.server.ts`, which is what makes "no decision ⇒
// never starts" structural: without the cookie the browser is never sent an
// `ingestPoint` or a `projectKey`, so there is nothing for the client to start
// even if it wanted to.

/** First-party cookie holding the visitor's decision. Server-read only. */
export const REPLAY_CONSENT_COOKIE = "hackagon_replay_consent"

/**
 * `granted` records, `denied` does not, and ABSENT is neither — it is the state
 * a first-time visitor is in, and it must behave exactly like `denied` until
 * they say otherwise. Three states rather than a boolean so "has not been
 * asked" is distinguishable from "said no": only the first should raise a
 * banner.
 */
export type ReplayConsent = "granted" | "denied"

/**
 * Six months, after which the banner comes back.
 *
 * Consent that never expires is consent nobody can remember giving, and the
 * recordings it authorises have their own bound (30 days, see
 * `.claude/skills/openreplay-stack/scripts/retention.sh`). A permission
 * outliving every artefact it produced by years is not a permission anyone
 * meaningfully holds.
 */
export const REPLAY_CONSENT_MAX_AGE = 60 * 60 * 24 * 180

/** Anything that is not one of the two known values is "no decision". */
export function parseReplayConsent(
  raw: string | null | undefined,
): ReplayConsent | null {
  return raw === "granted" || raw === "denied" ? raw : null
}
