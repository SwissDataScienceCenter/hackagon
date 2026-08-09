import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import { publicHackathonClient, requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { ClientError, Status } from "nice-grpc-common"

// Completing a hackathon's registration form.
//
// This route deliberately does NOT live under /my/hackathon/[id]/, because
// that subtree calls HackathonService.Get, which denies waitlisted users —
// and a waitlisted user is exactly who needs to fill this in. The schema is
// read from List instead, which carries registration_form and serves public
// hackathons to anyone.

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const hackathonId = event.params.id

  // Prefer the member view when the caller can see it (private events, or
  // confirmed members): Get carries the same schema plus their membership.
  let found
  try {
    const res = await hackathon.get({ hackathonId })
    found = res.hackathon
  } catch (e) {
    if (
      !(
        e instanceof ClientError &&
        (e.code === Status.PERMISSION_DENIED || e.code === Status.NOT_FOUND)
      )
    ) {
      throw e
    }
    // Waitlisted or not a member: fall back to the public listing.
    const listed = await publicHackathonClient.list({
      visibilityFilter: Visibility.VISIBILITY_PUBLIC,
    })
    found = listed.hackathons.find((h) => h.id === hackathonId)
  }

  if (!found) error(404, "Hackathon not found")
  if (!found.registrationForm) {
    error(404, "This hackathon has no registration form")
  }

  // Answers already on file, so the form opens filled in and can be corrected
  // rather than re-typed from memory. Its own RPC, not part of Get: Get denies
  // waitlisted users, who are exactly the people still reviewing their form.
  const existing = await hackathon.getRegistrationResponse({ hackathonId })

  // Struct values arrive as unknown; the form only ever renders text, and a
  // list field (`tags`) round-trips as a comma-separated string.
  const answers: Record<string, string> = {}
  for (const [k, v] of Object.entries(existing.responses ?? {})) {
    answers[k] = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v)
  }

  return {
    hackathonId,
    name: found.name,
    fields: found.registrationForm.fields,
    consents: found.registrationForm.consents,
    alreadySubmitted: existing.submitted,
    answers,
    consentValues: existing.consents ?? {},
  }
}

export const actions: Actions = {
  default: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    // Only keys the organizer defined are sent: the backend rejects unknown
    // fields, and echoing back stray form data (like the CSRF-ish extras a
    // browser may add) would trip that.
    const responses: Record<string, string> = {}
    for (const [k, v] of form.entries()) {
      if (k.startsWith("field:"))
        responses[k.slice("field:".length)] = String(v)
    }
    const consents: Record<string, boolean> = {}
    for (const k of form.keys()) {
      if (k.startsWith("consent:")) consents[k.slice("consent:".length)] = true
    }
    // An unchecked box submits nothing, so absent means "not given" — the
    // backend decides whether that is acceptable for a required consent.
    for (const k of String(form.get("consentKeys") ?? "").split(",")) {
      if (k && !(k in consents)) consents[k] = false
    }

    try {
      await hackathon.submitRegistrationForm({
        hackathonId: event.params.id,
        responses,
        consents,
      })
    } catch (e) {
      if (e instanceof ClientError) {
        if (e.code === Status.INVALID_ARGUMENT)
          // The backend names the offending key ("missing required field
          // \"affiliation\""), which is more useful than anything generic.
          return fail(400, {
            message: e.details || "Some answers are missing or invalid.",
          })
        if (e.code === Status.PERMISSION_DENIED)
          return fail(403, {
            message: "You are not registered for this hackathon.",
          })
        if (e.code === Status.FAILED_PRECONDITION)
          return fail(409, {
            message:
              e.details ||
              "Registration is closed — this is a deadline, not a permission problem.",
          })
        if (e.code === Status.ALREADY_EXISTS)
          // Only reachable by losing a race with a concurrent first submit;
          // normal edits are an upsert. Either way the answers are on file.
          return fail(409, {
            message: "Your answers were already saved — reload to see them.",
          })
      }
      throw e
    }

    return { submitted: true }
  },
}
