import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser!.id

  let results
  try {
    results = await Promise.all([
      hackathon.list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC }),
      hackathon.list({ participantId }),
    ])
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "Access denied")
    throw e
  }

  const [allResult, myResult] = results
  const myIds = new Set(myResult.hackathons.map((h) => h.id))

  return {
    session: event.locals.session,
    myHackathons: myResult.hackathons,
    otherHackathons: allResult.hackathons.filter((h) => !myIds.has(h.id)),
  }
}

export const actions: Actions = {
  // The dashboard Join button. The backend is authoritative (window,
  // capability and role checks) — this action only translates its verdicts
  // into user-readable messages.
  join: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const formData = await event.request.formData()
    const hackathonId = String(formData.get("hackathonId") ?? "")
    if (!hackathonId) return fail(400, { message: "Missing hackathon id." })

    // Does this event ask its registrants anything? Read it BEFORE joining:
    // afterwards the answer is the same, and asking first means a failed join
    // costs one call rather than two.
    // The same listing the page itself loaded from, so this sees exactly what
    // the caller is allowed to see. A failure here must not block joining —
    // worst case they reach the form from the event overview instead.
    const asksQuestions = await hackathon
      .list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC })
      .then((r) => {
        const form = r.hackathons.find((h) => h.id === hackathonId)?.registrationForm

        return Boolean(form && (form.fields.length > 0 || form.consents.length > 0))
      })
      .catch(() => false)

    try {
      await hackathon.join({ hackathonId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION)
        return fail(409, { message: "Registration is not open for this hackathon." })
      if (e instanceof ClientError && e.code === Status.ALREADY_EXISTS)
        return fail(409, { message: "You have already joined this hackathon." })
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
        return fail(403, { message: "You are not allowed to join this hackathon." })
      if (e instanceof ClientError && e.code === Status.NOT_FOUND)
        return fail(404, { message: "This hackathon no longer exists." })
      throw e
    }

    // Straight into the organizer's registration form. Joining is only half of
    // signing up when an event asks for an affiliation, dietary needs or a
    // code-of-conduct consent: without this the questions existed, the page
    // existed, and nothing ever sent anyone to it.
    //
    // Waitlisted registrants are redirected too — the form is independent of
    // approval, and their answers are exactly what an organizer reviews.
    if (asksQuestions) {
      redirect(303, `/register/${hackathonId}`)
    }

    return { joined: hackathonId }
  },
}
