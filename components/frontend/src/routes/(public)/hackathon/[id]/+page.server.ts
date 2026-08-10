import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import type { Actions, PageServerLoad } from "./$types"
import {
  createAuthorizedGrpc,
  publicHackathonClient,
  publicPageClient,
  type AuthorizedGrpc,
} from "$lib/server/grpc/client"
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

/**
 * An authorized client for a public route, or undefined when nobody is signed
 * in. Public routes never get `locals.grpc`; the session still carries the
 * token, so the client is cheap to make on the spot.
 */
function authorizedFor(session: unknown): AuthorizedGrpc | undefined {
  // `Session` does not declare accessToken — it is added by the jwt callback in
  // auth.ts and read the same way hooks.server.ts reads it.
  const token = (session as { accessToken?: string } | null)?.accessToken

  return token ? createAuthorizedGrpc(token) : undefined
}

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth()

  // Signed in, we ask AS them: the entry then carries `viewerMembership`, which
  // is what decides whether the call to action is "join" or "open your view".
  // A private event they belong to is also only visible on that call.
  //
  // The client is built HERE from the session's token rather than taken from
  // `event.locals.grpc`, which hooks.server.ts creates only for PROTECTED
  // routes. This page is public, so on a signed-in visit locals.grpc is
  // undefined and reaching for it threw — a 500 for exactly the person who
  // followed a link to an event while logged in, and invisible to every
  // anonymous check.
  const authed = authorizedFor(session)
  const hackathons = authed
    ? (await authed.hackathon.list({})).hackathons
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

  // The event's own published pages — the call for projects, the code of
  // conduct, the winners announcement, the wrap-up post. This is where they are
  // actually read: after the event, the public page IS the archive, and the
  // rewrite that replaced the static mock left it with a description and
  // nothing else.
  //
  // The backend decides what a caller may see (List falls back to visibility
  // for a public event, and hides drafts from anyone without page:write), so a
  // failure here costs the section rather than the page.
  const pages = await publicPageClient
    .list({ hackathonId: event.params.id })
    .then((r) =>
      r.pages.map((p) => ({ id: p.id, title: p.title, content: p.content })),
    )
    .catch(() => [])

  return { session, hackathon, pages }
}

export const actions: Actions = {
  // The same action as the dashboard's, because it is the same decision —
  // joining from the event's own page is the path someone following a link
  // takes, and until now there was none.
  join: async (event) => {
    // Same reason as the load: this is a public route, so there is no
    // locals.grpc even when the caller is signed in.
    const session = await event.locals.auth()
    const authed = authorizedFor(session)
    if (!authed) return fail(401, { message: "Please sign in to join." })
    const client = authed.hackathon

    // Read the form BEFORE joining: the answer is the same afterwards, and a
    // failed join then costs one call rather than two.
    const asksQuestions = await client
      .list({})
      .then((r) => {
        const form = r.hackathons.find(
          (h) => h.id === event.params.id,
        )?.registrationForm

        return Boolean(
          form && (form.fields.length > 0 || form.consents.length > 0),
        )
      })
      .catch(() => false)

    let joinResult
    try {
      joinResult = await client.join({ hackathonId: event.params.id })
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

    // The backend's verdict travels with the success: a join that lands on the
    // waiting list of a full event SUCCEEDED, and "you're in" versus "you're
    // number 4 in the queue" is exactly what the person who clicked wants told.
    return {
      joined: true,
      waitlisted: joinResult.waitlisted,
      queuePosition: joinResult.queuePosition,
    }
  },
}
