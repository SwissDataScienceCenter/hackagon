import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import type { Actions, PageServerLoad } from "./$types"
import {
  createAuthorizedGrpc,
  publicHackathonClient,
} from "$lib/server/grpc/client"
import {
  parseAnswers,
  questionRows,
  type QuestionRow,
} from "$lib/server/hackathon/registrationForm"
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
// **Redeeming grants visibility, not membership.** `Join` writes a waitlisted
// row and the organiser still confirms it, so a link forwarded beyond the people
// it was meant for cannot insert a stranger into the roster.
//
// This page is also where somebody comes *back* to. A waitlisted participant in
// a private hackathon holds no `hackathon:read` — that arrives with the `Member`
// role on approval — so the event is filtered out of `List`
// (`hackathon_service.go:1473`) and appears nowhere on their dashboard. Until
// they are approved, this link is the only trace of what they asked for, which
// is why `alreadyParticipant` gets a real state on screen rather than a silent
// redirect somewhere emptier.

interface Preview {
  hackathonId: string
  name: string
  description: string
  startsAt?: Date
  endsAt?: Date
  status: number
  questions: QuestionRow[]
  alreadyParticipant: boolean
}

/** An authorized client from the session, or undefined when nobody is signed in.
 *
 * Built here rather than taken from `event.locals.grpc`, which `hooks.server.ts`
 * only creates for protected routes. This route is public, so `locals.grpc` is
 * undefined even on a signed-in visit and `requireGrpc` would throw.
 */
function authorizedFor(session: CustomSession | null) {
  return session?.accessToken
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
    questions: questionRows(res.questions),
    alreadyParticipant: res.alreadyParticipant,
  }
}

export const load: PageServerLoad = async (event) => {
  const p = await preview(event.params.token)
  const session = (await event.locals.auth()) as CustomSession | null
  const signedIn = Boolean(session?.user)

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
    approved,
    signedIn,
  }
}

export const actions: Actions = {
  join: async (event) => {
    const session = (await event.locals.auth()) as CustomSession | null
    const grpc = authorizedFor(session)
    // The page only offers this button to a signed-in visitor — an anonymous one
    // gets the sign-in button instead — so this is the belt to that braces
    // rather than the path anybody takes.
    if (!grpc) {
      return fail(401, { message: "Please sign in first, then ask again." })
    }

    // Re-read the questions rather than trusting the form: the answers are
    // parsed against them, and an organiser may have changed the form while this
    // page sat open in somebody's mail client for a week.
    const p = await preview(event.params.token)
    const answers = parseAnswers(await event.request.formData(), p.questions)

    try {
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
