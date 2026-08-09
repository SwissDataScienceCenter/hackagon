import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import {
  consentRows,
  duplicateKey,
  formFieldRows,
} from "$lib/server/hackathon/formSchema"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// What this event asks people, in two schemas:
//
//   registration — answered when someone joins (/register/[id])
//   submission   — answered when a team turns work in
//
// Both are organiser-defined, so the questions differ per event and neither is
// hard-coded anywhere. Without this screen the registration page renders a
// schema nobody can author, which is how it stood after the design swap.

function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only this event's organisers can do that." })
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details })
  }
  throw e
}

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only this event's organisers can edit its forms")
  }

  // Both schemas come nested on the hackathon, so this needs no RPC of its own.
  return {
    registration: {
      fields: hackathon.registrationForm?.fields ?? [],
      consents: hackathon.registrationForm?.consents ?? [],
    },
    submission: {
      fields: hackathon.submissionForm?.fields ?? [],
    },
  }
}

export const actions: Actions = {
  registration: async (event) => {
    const { config } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const fields = formFieldRows(form)
    if (fields.length === 0)
      return fail(400, { message: "Add at least one question." })

    const consents = consentRows(form)
    const dupe =
      duplicateKey(fields.map((f) => f.key)) ??
      duplicateKey(consents.map((c) => c.key))
    if (dupe) return fail(400, { message: `Two rows share the key "${dupe}".` })

    try {
      // Set REPLACES the whole schema, which is why the form posts every row.
      await config.setRegistrationForm({
        hackathonId: event.params.id,
        fields,
        consents,
      })
    } catch (e) {
      return formError(e)
    }

    return { savedRegistration: true }
  },

  submission: async (event) => {
    const { config } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const fields = formFieldRows(form)
    if (fields.length === 0)
      return fail(400, { message: "Add at least one question." })

    const dupe = duplicateKey(fields.map((f) => f.key))
    if (dupe) return fail(400, { message: `Two rows share the key "${dupe}".` })

    try {
      await config.setSubmissionForm({ hackathonId: event.params.id, fields })
    } catch (e) {
      return formError(e)
    }

    return { savedSubmission: true }
  },
}
