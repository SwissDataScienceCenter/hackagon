import type { Actions, PageServerLoad } from "./$types"
import {
  resolvePhaseStatus,
  sortPhasesByStart,
  unmetPhaseCapabilities,
} from "$lib/utils/phase"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the phases
  // and the state.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const mayManage = mayManagePhases(myMembership ?? undefined, isAdmin)

  // Empty string rather than undefined when nothing is declared — `state` itself
  // is absent on a hackathon with no state row, which no longer happens for
  // seeded or app-created ones but is still the shape the proto allows.
  const currentPhaseId = hackathon.state?.currentPhaseId ?? ""
  const enabled = enabledCapabilities(hackathon.state)

  // Same ordering the header bar uses, so the two never disagree about the
  // sequence a participant is looking at.
  const phases = sortPhasesByStart(hackathon.phases).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    // A declared current phase wins over the dates — see `resolvePhaseStatus`.
    status: resolvePhaseStatus(p, currentPhaseId || undefined),
    // Raw enum numbers — `capabilityLabel` in `$lib/utils/phase` is keyed by
    // them, so the page needs no server-only import to render them.
    capabilities: p.capabilities as number[],
    // The page a phase links to. `hackathon.get` nests the pages, so the link
    // needs no lookup of its own; only phases with a page get one.
    pageId: p.pageId ?? "",
  }))

  // What the current phase says should be happening but is switched off. Only an
  // organizer can act on it, so only an organizer is told.
  const current = phases.find((p) => p.id === currentPhaseId)
  const unmet = mayManage
    ? unmetPhaseCapabilities(current?.capabilities ?? [], enabled)
    : []

  return {
    hackathonId: hackathon.id,
    phases,
    currentPhaseId,
    currentPhaseName: current?.name ?? "",
    unmet,
    mayManage,
  }
}

export const actions: Actions = {
  // Declare a phase current, or clear the declaration when `phaseId` is absent.
  // `SetCurrentPhase` reads an empty string as "clear", which is why the clear
  // form simply omits the field.
  setCurrent: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const phaseId = form.get("phaseId")

    try {
      await hackathon.setCurrentPhase({
        hackathonId: event.params.id,
        phaseId: typeof phaseId === "string" ? phaseId : "",
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to change the current phase",
        })
      }
      // Either the phase is gone, or the hackathon has no state row to point at
      // — the latter is a data gap rather than anything the organizer did.
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      throw e
    }

    return { message: "" }
  },
}
