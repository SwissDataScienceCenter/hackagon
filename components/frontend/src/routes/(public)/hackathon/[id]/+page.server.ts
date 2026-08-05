import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import type { Actions, PageServerLoad } from "./$types"
import { publicHackathonClient, requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"

// The public face of one event.
//
// It used to redirect anyone signed in straight to `/my/hackathon/<id>/overview`
// and render a hard-coded mock for everyone else — the title, dates, venue,
// speakers and "42 of 100 spots" were literals in the template, identical for
// every hackathon. Both halves were wrong in the same way: this page is what a
// link to an event shows a stranger, and it has to show THAT event.
//
// The redirect also assumed signed in ⇒ member, so anyone with an account who
// followed a link to an event they had not joined was sent to a view that
// answers PERMISSION_DENIED.
//
// Read through List rather than Get: `Get` is the member view and refuses
// anyone not on the confirmed roster, which is precisely the visitor this page
// exists for. List returns the same entity with the shallow fields — name,
// description, dates, logo, status — and the backend filters out events the
// caller may not see.

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth()

  // Signed in, we ask AS them: the entry then carries `viewerMembership`, which
  // is what decides whether the call to action is "join" or "open your view".
  // A private event they belong to is also only visible on that call.
  const authed = session?.user ? event.locals.grpc : undefined
  const hackathons = authed
    ? (await requireGrpc(authed).hackathon.list({})).hackathons
    : (
        await publicHackathonClient.list({
          visibilityFilter: Visibility.VISIBILITY_PUBLIC,
        })
      ).hackathons

  // A linear scan, because List has no by-id filter and this page cannot use
  // Get. Fine at this scale, and it keeps the visibility decision on the
  // backend: an event we may not see is simply absent from the list, so this
  // 404s rather than revealing that it exists.
  const hackathon = hackathons.find((h) => h.id === event.params.id)
  if (!hackathon) error(404, "Hackathon not found")

  return { session, hackathon }
}

export const actions: Actions = {
  // The same action as the dashboard's, because it is the same decision —
  // joining from the event's own page is the path someone following a link
  // takes, and until now there was none.
  join: async (event) => {
    const { hackathon: client } = requireGrpc(event.locals.grpc)

    // Read the form BEFORE joining: the answer is the same afterwards, and a
    // failed join then costs one call rather than two.
    const asksQuestions = await client
      .list({})
      .then((r) => {
        const form = r.hackathons.find((h) => h.id === event.params.id)
          ?.registrationForm

        return Boolean(form && (form.fields.length > 0 || form.consents.length > 0))
      })
      .catch(() => false)

    try {
      await client.join({ hackathonId: event.params.id })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
        return fail(403, { message: "You can't join this hackathon" })
      if (e instanceof ClientError && e.code === Status.NOT_FOUND)
        return fail(404, { message: "This hackathon no longer exists" })
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION)
        return fail(409, { message: e.details })
      if (e instanceof ClientError && e.code === Status.ALREADY_EXISTS)
        return fail(409, { message: "You have already joined this hackathon" })
      throw e
    }

    // Same rule as the dashboard's Join: an event that asks questions sends you
    // to them, because joining is only half of signing up.
    if (asksQuestions) redirect(303, `/register/${event.params.id}`)

    return { joined: true }
  },
}
