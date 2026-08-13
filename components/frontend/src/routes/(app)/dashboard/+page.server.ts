import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { ownerMembership } from "$lib/server/hackathon/membership"
import { error, fail } from "@sveltejs/kit"
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
      // TODO(backend: join-nil-ends-at): unreachable for a hackathon with no
      // end date — `Join` nil-derefs before it can answer. Correct as written;
      // the branch just needs the backend to survive long enough to take it.
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION)
        return fail(409, {
          closed: true,
          message: "This hackathon has already finished",
        })
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
