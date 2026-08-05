import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * The six capabilities, in the order the form renders them. Registration first
 * because it gates getting in at all; results last because it only matters once
 * everything else is over.
 */
const ORDER: Capability[] = [
  Capability.CAPABILITY_REGISTER,
  Capability.CAPABILITY_PROPOSE_PROJECTS,
  Capability.CAPABILITY_SET_TEAM_PREFERENCES,
  Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
  Capability.CAPABILITY_VOTE,
  Capability.CAPABILITY_VIEW_RESULTS,
]

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the state.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Same permission as phase management: both are gated on `hackathon:write` /
  // `phase:write`, which only an owner and an admin hold.
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can change these settings")
  }

  const enabled = new Set(enabledCapabilities(hackathon.state))

  return {
    hackathonId: hackathon.id,
    hackathonName: hackathon.name,
    // A hackathon with no state row cannot be configured at all — SetCapabilities
    // returns NotFound. Every seeded and app-created hackathon has one, so this
    // is a data gap rather than a state to design around; the page says so
    // instead of showing toggles that would all fail.
    hasState: hackathon.state !== undefined,
    capabilities: ORDER.map((c) => ({
      value: c as number,
      enabled: enabled.has(c as number),
    })),
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    // Every capability is sent every time, each with its own enabled flag —
    // `SetCapabilities` takes a list of states rather than a delta, and an empty
    // list is a no-op read. Unchecked boxes submit nothing, hence the `has`.
    const checked = new Set(form.getAll("capabilities").map(String))
    const capabilities = ORDER.map((c) => ({
      capability: c,
      enabled: checked.has(String(c as number)),
    }))

    try {
      await hackathon.setCapabilities({
        hackathonId: event.params.id,
        capabilities,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to change these settings",
        })
      }
      // TODO(backend: project-preferences-capability): NotFound here means the
      // hackathon has no HackathonState row, and by the time it is raised
      // `SetCapabilities` has already written the casbin policies — it adds them
      // inside the capability loop, then fails on the state re-read
      // (`hackathon_service.go:655` then `:681`). So a failure reported here may
      // have granted permissions anyway. No hackathon reachable from the app is
      // in that state, so this is a guard rather than a live problem.
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, {
          message:
            "This hackathon has no configuration record, so capabilities cannot be changed",
        })
      }
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      throw e
    }

    return { message: "", saved: true }
  },
}
