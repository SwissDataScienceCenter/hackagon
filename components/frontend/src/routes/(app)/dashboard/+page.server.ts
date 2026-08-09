import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser!.id
  const { isGlobalAdmin } = await event.parent()

  // TODO(backend: enroll creator as participant): myResult is participation, not
  // ownership, so a hackathon the viewer created never reaches myHackathons. A
  // public one lands under "other" as though it belonged to someone else; a
  // private one appears nowhere, since the other list is filtered to public.
  // Resolves itself once Create writes the Participant row — no change needed
  // on this side.
  const [allResult, myResult] = await Promise.all([
    hackathon.list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC }),
    hackathon.list({ participantId }),
  ])

  const myIds = new Set(myResult.hackathons.map((h) => h.id))

  return {
    session: event.locals.session,
    myHackathons: myResult.hackathons,
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

    // Does this event ask its registrants anything? Read it BEFORE joining:
    // the answer is the same afterwards, and asking first means a failed join
    // costs one call rather than two. Same listing the page loaded from, so it
    // sees exactly what this caller may see, and a failure here must not block
    // joining — worst case they reach the form from the event overview.
    const asksQuestions = await hackathon
      .list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC })
      .then((r) => {
        const form = r.hackathons.find(
          (h) => h.id === hackathonId,
        )?.registrationForm

        return Boolean(
          form && (form.fields.length > 0 || form.consents.length > 0),
        )
      })
      .catch(() => false)

    try {
      await hackathon.join({ hackathonId })
    } catch (e) {
      // A closed window is a clock, not a permission: the backend says
      // FAILED_PRECONDITION so this can say "registration is not open" rather
      // than "you are not allowed".
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION)
        return fail(409, {
          message: "Registration is not open for this hackathon.",
        })
      if (e instanceof ClientError && e.code === Status.ALREADY_EXISTS)
        return fail(409, { message: "You have already joined this hackathon." })
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
        return fail(403, { message: "You can't join this hackathon" })
      if (e instanceof ClientError && e.code === Status.NOT_FOUND)
        return fail(404, { message: "This hackathon no longer exists" })
      throw e
    }

    // Straight into the organiser's registration form. Joining is only half of
    // signing up when an event asks for an affiliation, dietary needs or a
    // code-of-conduct consent: without this the questions exist, the page
    // exists, and nothing ever sends anyone to it.
    //
    // Waitlisted registrants are redirected too — the form is independent of
    // approval, and their answers are exactly what an organiser reviews.
    if (asksQuestions) redirect(303, `/register/${hackathonId}`)

    // Otherwise no redirect: SvelteKit re-runs `load` after an action, so the
    // hackathon moves into "Your hackathons" with a Waitlisted badge on its own.
    return { joined: hackathonId }
  },
}
