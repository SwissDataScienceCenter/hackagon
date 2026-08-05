import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import {
  parsePhaseForm,
  phaseCapabilities,
  syncPhaseCapabilities,
} from "$lib/server/hackathon/phaseForm"
import { resolve } from "$app/paths"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { phase } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can edit phases")
  }

  // Fetched rather than picked out of the layout's `hackathon.get`, even though
  // that response nests the phases: after a save this page reloads, and the
  // layout's copy can still be the pre-edit tree. Asking PhaseService means the
  // form always shows what was actually stored.
  let result
  try {
    result = await phase.get({ phaseId: event.params.phaseId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "This phase is not available")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Phase not found")
    }
    throw e
  }

  if (!result.phase) {
    error(404, "Phase not found")
  }

  // A phase id from another hackathon would otherwise render inside this
  // hackathon's shell, under its nav and header — and `Edit` would then happily
  // write to it, since it takes the hackathon from the phase rather than the URL.
  if (result.phase.hackathonId !== event.params.id) {
    error(404, "Phase not found")
  }

  return {
    hackathonId: hackathon.id,
    phase: {
      id: result.phase.id,
      name: result.phase.name,
      description: result.phase.description ?? "",
      startsAt: result.phase.startsAt,
      endsAt: result.phase.endsAt,
      pageId: result.phase.pageId ?? "",
      // Raw enum numbers — what the form's checkboxes carry, and what
      // `capabilityLabel` in `$lib/utils/phase` is keyed by.
      capabilities: phaseCapabilities(hackathon.capabilities, result.phase.id),
    },
    pages: hackathon.pages.map((p) => ({ id: p.id, title: p.title })),
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { phase, hackathon } = requireGrpc(event.locals.grpc)

    const parsed = parsePhaseForm(await event.request.formData())
    if (!parsed.ok) {
      return fail(400, { message: parsed.message })
    }
    const values = parsed.values

    try {
      await phase.edit({
        phaseId: event.params.phaseId,
        name: values.name,
        description: values.description,
        // TODO(backend: phase-edit-clear-dates): `Edit` tests
        // `req.GetStartsAt() != nil` rather than presence
        // (`phase_service.go:284-291`), so it never calls `ClearStartsAt`. Once a
        // phase has dates there is no request that takes them off again —
        // sending nothing reads as "no change", not "unset". The form says so,
        // and an emptied date field silently keeps the old value. Send the
        // cleared state here once the handler can accept it.
        startsAt: values.startsAt,
        endsAt: values.endsAt,
        // Empty string is meaningful on Edit and unlinks the page — unlike
        // Create, where it would fail the UUID rule.
        pageId: values.pageId,
      })

      // Then the capability links, which live on the capability rather than on
      // the phase — see syncPhaseCapabilities.
      const { hackathon: current } = await hackathon.get({
        hackathonId: event.params.id,
      })
      await syncPhaseCapabilities(
        hackathon,
        event.params.id,
        event.params.phaseId,
        values.capabilities,
        current?.capabilities,
      )
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit this phase",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: e.details })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/timeline`))
  },

  delete: async (event) => {
    const { phase } = requireGrpc(event.locals.grpc)

    try {
      await phase.delete({ phaseId: event.params.phaseId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to delete this phase",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Phase not found" })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/timeline`))
  },
}
