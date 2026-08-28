import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { ownerMembership } from "$lib/server/hackathon/membership"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  // hooks.server.ts leaves platformUser undefined when WhoAmI came back
  // UNAVAILABLE, and also when it succeeded but returned no user. Without this
  // guard the first page after login died on a bare TypeError, surfaced as an
  // unexpected 500 that named nothing. The message stays on the symptom rather
  // than blaming the connection, since both causes land here.
  const participantId = event.locals.platformUser?.id
  if (!participantId) {
    error(
      503,
      "Could not load your account from the backend. Please try again.",
    )
  }
  const { isGlobalAdmin } = await event.parent()

  // Three lists because participation and ownership are separate records and
  // `Create` only writes the second: it grants the creator the casbin Owner role
  // and the owners edge, never a Participant row. So a hackathon the viewer made
  // reaches neither of the first two lists — a public one lands under "other" as
  // though it belonged to someone else, a private one appears nowhere at all,
  // and the only route to it is the redirect `create` performs once.
  //
  // TODO(backend: list-registration-state): neither list says whether a
  // hackathon is taking registrations, so "Other hackathons" cannot tell a Join
  // that will work from one that will be denied. The answer lives in
  // `state.capabilities`, which only `Get` populates — and `Get` needs
  // `hackathon:read`, which is exactly what a non-member does not have. So the
  // button is offered and the refusal reported, rather than guessed at here.
  const [allResult, myResult, ownedResult] = await Promise.all([
    hackathon.list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC }),
    hackathon.list({ participantId }),
    hackathon.list({ ownerId: participantId }),
  ])

  const participatingIds = new Set(myResult.hackathons.map((h) => h.id))

  // `viewerMembership` is stated rather than read: List fills it in only for the
  // participant filter, and these are precisely the hackathons with no
  // participant row to fill it from. It is not decoration — `canOpenHackathon`
  // reads it to decide whether the row links anywhere at all, so leaving it
  // undefined would list a hackathon the viewer owns as dead text.
  const ownedOnly = ownedResult.hackathons
    .filter((h) => !participatingIds.has(h.id))
    .map((h) => ({
      ...h,
      viewerMembership: ownerMembership(undefined, h.createdAt),
    }))

  const myHackathons = [...myResult.hackathons, ...ownedOnly]
  const myIds = new Set(myHackathons.map((h) => h.id))

  return {
    session: event.locals.session,
    myHackathons,
    otherHackathons: allResult.hackathons.filter((h) => !myIds.has(h.id)),
    isGlobalAdmin,
  }
}

export const actions: Actions = {
  join: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)

    const form = await event.request.formData()
    const hackathonId = form.get("hackathonId")
    if (typeof hackathonId !== "string" || hackathonId === "")
      return fail(400, { message: "No hackathon was given" })

    // Does this event ask anything? If it does, joining is only half of signing
    // up: `Join` validates the mandatory answers and refuses a bare press, so
    // the form has to come first. `listQuestions` serves a public hackathon to
    // any caller, which is what makes the check possible before joining.
    //
    // A refusal here means a private hackathon the viewer holds no role in.
    // `Join` is about to refuse that too, so it falls through and lets the
    // backend say so rather than guessing.
    let asksQuestions = false
    try {
      const { questions } = await hackathon.listQuestions({ hackathonId })
      asksQuestions = questions.length > 0
    } catch (e) {
      if (!(e instanceof ClientError)) throw e
    }
    // Outside the try: `redirect` throws, and a redirect thrown inside it would
    // be caught by the handler above and only survive by accident.
    if (asksQuestions) redirect(303, `/register/${hackathonId}`)

    try {
      await hackathon.join({ hackathonId })
    } catch (e) {
      // `closed` tells the view to retire this row's button rather than leave
      // it there to be pressed again. Both refusals below are settled facts
      // about the hackathon, not transient failures, so re-pressing cannot help.
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
        // Named for the cause rather than the code: the *only* thing gating
        // `hackathon:join` is the casbin row `CAPABILITY_REGISTER` writes
        // (`hackathon_service.go:641`), so a denial here means registration is
        // off — not that the viewer is the wrong sort of person.
        return fail(403, {
          closed: true,
          message: "Registration is closed for this hackathon",
        })
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
        // `Join` answers FAILED_PRECONDITION both for a finished hackathon and
        // for unanswered mandatory questions, and those need opposite handling —
        // one is over, the other is a form away. Reached only when the check
        // above could not run, so the details are what tell them apart.
        if (e.details.includes("mandatory"))
          redirect(303, `/register/${hackathonId}`)

        return fail(409, {
          closed: true,
          message: "This hackathon has already finished",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND)
        return fail(404, { message: "This hackathon no longer exists" })
      throw e
    }

    // No redirect: SvelteKit re-runs `load` after an action, so the hackathon
    // moves from "Other hackathons" into "Your hackathons" with a Waitlisted
    // badge on its own.
    return {}
  },
}
