import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import type { Actions, PageServerLoad } from "./$types"
import {
  createAuthorizedGrpc,
  publicHackathonClient,
} from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import {
  parseAnswers,
  questionRows,
  type QuestionRow,
} from "$lib/server/hackathon/registrationForm"
// Shared and tested, because it is subtle: a session can carry a user and a
// stale accessToken at once, and only `error` says so. See $lib/server/session.
import { usableSession } from "$lib/server/session"
// The type import also pulls in the module augmentation that puts `accessToken`
// on Session — the same one hooks.server.ts relies on.
import type { CustomSession } from "../../../../auth.d"

// Redeeming an invitation.
//
// **Public on purpose.** The route is in `PUBLIC_ROUTE_PATTERNS`, so somebody
// opening the link from their mail sees what they were invited to before being
// asked to sign in. The token is the credential — `PreviewInvite` performs no
// permission check at all and serves anonymous callers — so demanding a session
// first would add a login wall in front of information the link already grants.
//
// **Redeeming a private hackathon's link grants membership outright.** `Join`
// confirms the joiner itself when the hackathon is private: the invitation is
// the organizer's decision about who takes part, and requiring a second
// confirmation left the invitee holding no role and therefore unable to see the
// event at all. The flip side is that the link *is* admission — a link forwarded
// beyond the people it was meant for lets a stranger in, and revoking it or
// removing the participant are the controls, both after the fact.
//
// A public hackathon reached through a link still waitlists, so `autoApproves`
// below decides which of the two the page describes. Invites are not restricted
// to private hackathons (`CreateInvite` performs no visibility check), so this
// cannot be assumed from the route.
//
// This page is also where somebody comes *back* to, which still matters for the
// public case: a waitlisted participant holds no `Member` role, so a private
// hackathon they are waiting in is filtered out of `List`
// (`hackathon_service.go:1473`) and appears nowhere on their dashboard. That is
// now only reachable for somebody waitlisted before auto-approval existed, or
// whose confirmation half-failed — and it is exactly why `alreadyParticipant`
// still gets a real state on screen rather than a silent redirect somewhere
// emptier.

interface Preview {
  hackathonId: string
  name: string
  description: string
  startsAt?: Date
  endsAt?: Date
  status: number
  /** Whether `Join` confirms on the spot here, which it does for a private
   * hackathon. Decides whether this page offers a place or asks for one. */
  autoApproves: boolean
  questions: QuestionRow[]
  alreadyParticipant: boolean
}

/** An authorized client from the session, or undefined when there is no usable one.
 *
 * Built here rather than taken from `event.locals.grpc`, which `hooks.server.ts`
 * only creates for protected routes. This route is public, so `locals.grpc` is
 * undefined even on a signed-in visit and `requireGrpc` would throw.
 */
function authorizedFor(session: CustomSession | null) {
  return usableSession(session) && session?.accessToken
    ? createAuthorizedGrpc(session.accessToken)
    : undefined
}

/** Exchange the token for what the page renders. */
async function preview(token: string): Promise<Preview> {
  let res
  try {
    res = await publicHackathonClient().previewInvite({ token })
  } catch (e) {
    if (e instanceof ClientError) {
      // One answer for all four dead cases, because the backend gives one:
      // unknown, revoked and expired are an identical NOT_FOUND, so a link
      // somebody should not have cannot be told apart from one that lapsed.
      //
      // INVALID_ARGUMENT belongs in the same branch. `token` is a uuid in the
      // proto, so protovalidate rejects a malformed one before the handler can
      // turn it into NOT_FOUND — without this, `/invite/nonsense` is a 500 that
      // blames the server for an ordinary typo. Confirmed on the wire, not
      // guessed.
      if (e.code === Status.NOT_FOUND || e.code === Status.INVALID_ARGUMENT) {
        error(
          404,
          "This invitation link is not valid, or it has been withdrawn",
        )
      }
    }
    throw e
  }

  if (!res.hackathon) {
    error(404, "This invitation link is not valid, or it has been withdrawn")
  }

  return {
    hackathonId: res.hackathon.id,
    name: res.hackathon.name,
    description: res.hackathon.description ?? "",
    startsAt: res.hackathon.startsAt,
    endsAt: res.hackathon.endsAt,
    status: res.hackathon.status as number,
    autoApproves: res.hackathon.visibility === Visibility.VISIBILITY_PRIVATE,
    questions: questionRows(res.questions),
    alreadyParticipant: res.alreadyParticipant,
  }
}

export const load: PageServerLoad = async (event) => {
  const p = await preview(event.params.token)
  const session = (await event.locals.auth()) as CustomSession | null
  // A stale session counts as signed out here: the page then offers the sign-in
  // button, which is the one control that fixes it. Offering "Request a place"
  // to somebody holding a dead token is how this page produced a 500.
  const signedIn = usableSession(session)

  // Whether an existing participant has been approved yet, derived rather than
  // asked: `PreviewInvite` reports only *that* somebody holds a participant row,
  // not whether it is confirmed. A private hackathon appears in `List` only for
  // a caller holding `hackathon:read`, which is the `Member` role, which is
  // exactly what approval grants — so its presence in their own list is the
  // answer, and it costs one call nobody else on this page makes.
  let approved = false
  if (signedIn && p.alreadyParticipant) {
    const grpc = authorizedFor(session)
    if (grpc) {
      approved = await grpc.hackathon
        .list({ statusFilter: [] })
        .then((r) => r.hackathons.some((h) => h.id === p.hackathonId))
        // A failure here costs the link into the event, not the page: they are
        // on the list either way, and that is the part they came to read.
        .catch(() => false)
    }
  }

  return {
    token: event.params.token,
    hackathon: {
      id: p.hackathonId,
      name: p.name,
      description: p.description,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      status: p.status,
    },
    questions: p.questions,
    alreadyParticipant: p.alreadyParticipant,
    autoApproves: p.autoApproves,
    approved,
    signedIn,
  }
}

export const actions: Actions = {
  join: async (event) => {
    const session = (await event.locals.auth()) as CustomSession | null
    const grpc = authorizedFor(session)
    // Reachable, and not only through a hand-made POST: a session can go stale
    // while the page sits open in a mail client, which is exactly what this page
    // invites. The load re-runs after this, sees the same stale session and
    // renders the sign-in button, so the message and the control agree.
    if (!grpc) {
      return fail(401, {
        message:
          "Your sign-in has expired. Sign in again — this invitation still works.",
      })
    }

    // Re-read the questions rather than trusting the form: the answers are
    // parsed against them, and an organiser may have changed the form while this
    // page sat open in somebody's mail client for a week.
    const p = await preview(event.params.token)
    const answers = parseAnswers(await event.request.formData(), p.questions)

    try {
      // Provision the platform user before joining. `hooks.server.ts` does this
      // (`:182`) for **protected** routes only, and this route is public on
      // purpose — so somebody who signs in *from the invitation* and accepts it
      // on the spot reaches `Join` holding a Keycloak account and no `users`
      // row. `Join` answers that with NOT_FOUND (`hackathon_service.go:605`),
      // which the branch below reports as an invalid invitation: exactly how a
      // live link looked broken to the one person it was written for, somebody
      // whose first ever visit to the platform is this page.
      //
      // `Register` is idempotent — it returns the existing user, syncing the
      // profile fields Keycloak holds — so this is safe on every join rather
      // than only a first one, and it needs no "have they registered?" call in
      // front of it.
      await grpc.user.register({})

      await grpc.hackathon.join({
        hackathonId: p.hackathonId,
        answers,
        inviteToken: event.params.token,
      })
    } catch (e) {
      if (e instanceof ClientError) {
        // The four refusals the invite gate can produce, which the backend
        // deliberately does *not* collapse into one — so each can be reported
        // for what it is. `Join`'s codes differ from `PreviewInvite`'s: a link
        // that previewed fine a moment ago can still be revoked between the two
        // calls, and this is the branch that says so.
        if (e.code === Status.FAILED_PRECONDITION)
          return fail(409, {
            message:
              e.details ||
              "This invitation is no longer valid. Ask the organizers for a new link.",
          })
        if (e.code === Status.NOT_FOUND)
          return fail(404, {
            message: "This invitation is no longer valid.",
          })
        // Registration is not open, or the invite gate refused. Either way the
        // organisers are the ones who can change it.
        if (e.code === Status.PERMISSION_DENIED)
          return fail(403, {
            message:
              "This event is not taking requests right now. The organizers " +
              "will know when it reopens.",
          })
        if (e.code === Status.INVALID_ARGUMENT)
          return fail(400, {
            message: e.details || "Some answers are not valid.",
          })
        // The backend refusing the token itself. UNAUTHENTICATED is what the
        // middleware means to send.
        //
        // TODO(backend: jwt-error-codes): INTERNAL is in this branch because it
        // is what actually arrives. `errors.go` matches jwt/**v4**'s
        // `*ValidationError` while `auth.go` parses with **v5**, which removed
        // that type — so `errors.As` never matches and every auth failure falls
        // past the `unauthenticatedErrors` list to `codes.Internal`. Drop
        // INTERNAL from here once that is fixed; until then a genuine server
        // fault during a join is reported to the user as an expired session,
        // which is the lesser of the two wrong answers available.
        if (e.code === Status.UNAUTHENTICATED || e.code === Status.INTERNAL)
          return fail(401, {
            message:
              "Your sign-in has expired. Sign in again — this invitation still works.",
          })
      }
      throw e
    }

    // No redirect. Their dashboard cannot show a private hackathon they are only
    // waitlisted in — it is filtered out of `List` without `hackathon:read` — so
    // sending them there would answer "what happened?" with an empty page. The
    // load re-runs and `alreadyParticipant` now says they are on the list.
    return { joined: true }
  },
}
