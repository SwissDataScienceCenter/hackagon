import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import {
  capabilitiesByPhase,
  capabilityNoun,
  readCapabilities,
} from "$lib/utils/capabilities"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { phase, page } = requireGrpc(event.locals.grpc)
  const { hackathon } = await event.parent()

  const [phaseResult, pageResult] = await Promise.all([
    phase.list({ hackathonId: event.params.slug }),
    page.list({ hackathonId: event.params.slug }),
  ])

  const pageTitles = new Map(pageResult.pages.map((p) => [p.id, p.title]))

  // What advancing to each phase would switch on and off. Shown per row so the
  // consequences of the button are visible before it is pressed — it rewrites
  // several capability flags at once.
  const unlocks = capabilitiesByPhase(readCapabilities(hackathon.capabilities))

  const phases = phaseResult.phases.map((p) => {
    const forPhase = unlocks.get(p.id)

    return {
      id: p.id,
      name: p.name,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      pageId: p.pageId,
      pageTitle: p.pageId ? pageTitles.get(p.pageId) : undefined,
      opens: (forPhase?.opens ?? []).map(capabilityNoun),
      closes: (forPhase?.closes ?? []).map(capabilityNoun),
    }
  })

  return {
    hackathonId: event.params.slug,
    phases,
    currentPhaseId: hackathon.currentPhaseId,
  }
}

export const actions: Actions = {
  // Declares which phase the hackathon is in, switching every scheduled
  // capability to match in one write. Capabilities with no phase link — voting,
  // and anything else the organizer drives by hand — are left untouched.
  advance: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const phaseId = form.get("phaseId")
    if (typeof phaseId !== "string" || phaseId === "") {
      return fail(400, { message: "Missing phase id" })
    }

    try {
      await hackathon.advancePhase({
        hackathonId: event.params.slug,
        phaseId,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to advance this hackathon",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Phase not found" })
      }
      // The button is already disabled for a phase that has not started, so this
      // is the race: its date moved, or the two clocks disagree. The backend is
      // the one that decides.
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
        return fail(409, {
          message: "That phase hasn't started yet. Change its start date first.",
        })
      }
      throw e
    }

    return { success: true }
  },

  delete: async (event) => {
    const { phase } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const phaseId = form.get("phaseId")
    if (typeof phaseId !== "string" || phaseId === "") {
      return fail(400, { message: "Missing phase id" })
    }

    try {
      await phase.delete({ phaseId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to delete this phase" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Phase not found" })
      }
      throw e
    }

    return { success: true }
  },
}
