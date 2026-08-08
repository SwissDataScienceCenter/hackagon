import { redirect, type RequestHandler } from "@sveltejs/kit"
import {
  REPLAY_CONSENT_COOKIE,
  REPLAY_CONSENT_MAX_AGE,
  parseReplayConsent,
} from "$lib/utils/replayConsent"
import { safeReturnTo } from "$lib/utils/returnTo"

// Records (or withdraws) this browser's permission for session replay.
//
// A plain POST endpoint outside both route groups, for three reasons:
//
//  1. IT MUST WORK FOR ANONYMOUS VISITORS. The tracker runs on the landing
//     page and on invite links, so the person deciding may have no account.
//     `hooks.server.ts` lists `/consent/` as public for exactly this.
//  2. IT MUST WORK BEFORE HYDRATION. The banner is a plain `<form method=POST>`
//     with no `use:enhance`: this app has already shipped a control whose
//     `onclick` did not exist yet when it was first clicked (the account menu,
//     2026-08-05), and a consent button that silently does nothing on the first
//     click is the worst possible version of that bug.
//  3. THE REDIRECT IS THE MECHANISM, not a nicety. Answering with a 303 forces
//     a full document load, so the next page is rendered by a server that has
//     already read the new cookie. Withdrawing therefore does not merely stop
//     future recordings — the recording page itself is torn down and its
//     replacement is never given an ingest endpoint. An `enhance`d submit would
//     have left the tracker running in a live document.
export const POST: RequestHandler = async (event) => {
  const form = await event.request.formData()
  const decision = parseReplayConsent(String(form.get("decision") ?? ""))
  // Same validation the login flow uses: this value comes from a form field,
  // so an unchecked one turns a consent button into an open redirect.
  const back = safeReturnTo(String(form.get("returnTo") ?? "")) ?? "/"

  if (decision === null) {
    // An unparseable answer clears the decision rather than guessing one. Back
    // to "not asked", which behaves as "no".
    event.cookies.delete(REPLAY_CONSENT_COOKIE, { path: "/" })
  } else {
    event.cookies.set(REPLAY_CONSENT_COOKIE, decision, {
      path: "/",
      maxAge: REPLAY_CONSENT_MAX_AGE,
      // Nothing in the browser needs to read this: the only consumer is
      // `+layout.server.ts`, which decides whether to send the tracker's
      // config at all. Keeping it out of `document.cookie` means a script on
      // the page — ours, or one that got there — cannot flip it.
      httpOnly: true,
      sameSite: "lax",
      secure: Boolean(event.locals.config?.cookies?.useSecure),
    })
  }

  redirect(303, back)
}
