import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// Creating a hackathon. Until now HackathonService.Create was reachable only
// through grpcurl, so nobody could start an event from the browser — and the
// sidebar already linked here, to a route that did not exist.
//
// Who may create is a casbin question (HackathonOrganizer or Admin), so the
// page renders for anyone signed in and the backend's verdict is translated.

export const load: PageServerLoad = async () => {
  return {}
}

/** A datetime-local value ("2026-07-26T09:00") as a Date, or undefined. */
function parseWhen(raw: FormDataEntryValue | null): Date | undefined {
  const s = String(raw ?? "").trim()
  if (!s) return undefined
  const d = new Date(s)

  return Number.isNaN(d.getTime()) ? undefined : d
}

export const actions: Actions = {
  default: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const name = String(form.get("name") ?? "").trim()
    // Mirrors the proto's min_len so the user gets the message inline rather
    // than as a raw validation error.
    if (name.length < 3) {
      return fail(400, { message: "Give the event a name of at least 3 characters." })
    }

    const startsAt = parseWhen(form.get("startsAt"))
    const endsAt = parseWhen(form.get("endsAt"))
    // The proto enforces this with a CEL rule; checking here keeps the wording
    // human and preserves what the user typed.
    if (Boolean(startsAt) !== Boolean(endsAt)) {
      return fail(400, {
        message: "Set both a start and an end date, or leave both empty.",
        values: { name },
      })
    }
    if (startsAt && endsAt && endsAt < startsAt) {
      return fail(400, { message: "The end date cannot be before the start date." })
    }

    const isPrivate = form.get("visibility") === "private"
    const description = String(form.get("description") ?? "").trim()

    let created
    try {
      created = await hackathon.create({
        name,
        startsAt,
        endsAt,
        visibility: isPrivate ? Visibility.VISIBILITY_PRIVATE : Visibility.VISIBILITY_PUBLIC,
        description: description || undefined,
      })
    } catch (e) {
      if (e instanceof ClientError) {
        if (e.code === Status.PERMISSION_DENIED)
          return fail(403, {
            message:
              "Your account cannot create hackathons. Ask a platform admin for organizer access.",
          })
        if (e.code === Status.UNAUTHENTICATED)
          return fail(401, { message: "Please sign in again." })
        if (e.code === Status.INVALID_ARGUMENT)
          return fail(400, { message: e.details || "Some details are invalid." })
      }
      throw e
    }

    // Creating makes the caller Owner, so send them straight to the cockpit
    // where the next steps (pages, invites, participants) live.
    redirect(303, `/my/hackathon/${created.hackathonId}/manage`)
  },
}
