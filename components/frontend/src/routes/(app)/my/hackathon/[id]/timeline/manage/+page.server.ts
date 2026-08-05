import type { Actions, PageServerLoad } from "./$types"
import {
  extraEnabledCapabilities,
  resolvePhaseStatus,
  sortPhasesByStart,
  unmetPhaseCapabilities,
  withPhaseCapabilitiesEnabled,
} from "$lib/utils/phase"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import {
  CAPABILITY_ORDER,
  capabilityStates,
  enabledCapabilities,
} from "$lib/server/hackathon/phaseForm"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the phases
  // and the state.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Frontend-only gate, same shape as the tracks and teams manage routes: the
  // RPCs below enforce it for real, this only decides whether the page renders.
  // Everything this loader returns is organizer-only, so the check comes first
  // and a participant is sent none of it — unlike before, when one page served
  // both audiences and had to withhold half its payload field by field.
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can manage the timeline")
  }

  // Empty string rather than undefined when nothing is declared — `state` itself
  // is absent on a hackathon with no state row, which no longer happens for
  // seeded or app-created ones but is still the shape the proto allows.
  const currentPhaseId = hackathon.state?.currentPhaseId ?? ""
  const enabled = enabledCapabilities(hackathon.state)

  // Same ordering the participant timeline and the header bar use, so no two
  // surfaces disagree about the sequence.
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

  const current = phases.find((p) => p.id === currentPhaseId)

  return {
    hackathonId: hackathon.id,
    phases,
    // Only the name is sent: the page finds the current phase by its resolved
    // `current` status rather than comparing ids, and the name is needed for the
    // mismatch warning's prose.
    currentPhaseName: current?.name ?? "",
    // A hackathon with no state row cannot be configured at all —
    // `SetCapabilities` answers NotFound. Every seeded and app-created hackathon
    // has one, so this is a data gap rather than a state to design around.
    hasState: hackathon.state !== undefined,
    capabilities: CAPABILITY_ORDER.map((c) => ({
      value: c as number,
      enabled: enabled.includes(c as number),
    })),
    // What the current phase says should be happening but is switched off.
    unmet: unmetPhaseCapabilities(current?.capabilities ?? [], enabled),
    // Lets the page tick off which of the current phase's plans are actually
    // live — for the current phase alone: marking a future phase's plan "not
    // enabled" would read as broken when it is simply not time yet.
    enabled,
    // Switched on beyond what this phase planned for. Information, not a problem.
    alsoEnabled: extraEnabledCapabilities(current?.capabilities ?? [], enabled),
  }
}

/**
 * Reads the hackathon fresh, rather than trusting the client for what is
 * currently enabled or which phase is current.
 *
 * `event.parent()` is not available in an action, and re-reading is the right
 * thing anyway: `applyPhaseCapabilities` computes a union against the live state,
 * so a stale page cannot switch something back on that was just turned off.
 */
async function readState(
  grpc: ReturnType<typeof requireGrpc>,
  hackathonId: string,
) {
  const { hackathon } = await grpc.hackathon.get({ hackathonId })

  return {
    enabled: enabledCapabilities(hackathon?.state),
    currentPhaseId: hackathon?.state?.currentPhaseId ?? "",
    phases: hackathon?.phases ?? [],
  }
}

/** Shared translation: every action here writes through the same two RPCs. */
function toFailure(e: unknown) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
    return fail(403, {
      message: "You don't have permission to change this hackathon",
    })
  }
  // TODO(backend: project-preferences-capability): on `SetCapabilities` a
  // NotFound means the hackathon has no HackathonState row — and by then the
  // casbin policies have already been written, because they are added inside the
  // capability loop before the state re-read fails (`hackathon_service.go:655`
  // then `:681`). So a failure reported here may have granted permissions anyway.
  // No hackathon reachable from the app is in that state, so this is a guard.
  if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
    return fail(404, { message: e.details })
  }
  if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
    return fail(400, { message: e.details })
  }

  return undefined
}

export const actions: Actions = {
  // Declare a phase current, or clear the declaration when `phaseId` is absent.
  // `SetCurrentPhase` reads an empty string as "clear", which is why the clear
  // form simply omits the field.
  //
  // Deliberately does *not* touch capabilities. Moving between phases changes
  // what the timeline says, never what participants may do — that stays an
  // explicit act on the switches, or one click on "enable what this phase
  // expects".
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
      const failure = toFailure(e)
      if (failure) return failure
      throw e
    }

    return { message: "" }
  },

  // The six switches, saved together. `SetCapabilities` takes a full list of
  // states rather than a delta, and unchecked boxes submit nothing — hence
  // building the list from CAPABILITY_ORDER rather than from what arrived.
  saveCapabilities: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const checked = new Set(form.getAll("capabilities").map(String))
    const enabled = CAPABILITY_ORDER.filter((c) =>
      checked.has(String(c as number)),
    ).map((c) => c as number)

    try {
      await hackathon.setCapabilities({
        hackathonId: event.params.id,
        capabilities: capabilityStates(enabled),
      })
    } catch (e) {
      const failure = toFailure(e)
      if (failure) return failure
      throw e
    }

    return { message: "", saved: true }
  },

  // Switch on whatever the current phase expects and is off. Additive only — see
  // `withPhaseCapabilitiesEnabled`; nothing is ever switched off here, so this
  // cannot close registration as a side effect of moving through phases.
  applyPhaseCapabilities: async (event) => {
    const grpc = requireGrpc(event.locals.grpc)

    try {
      const state = await readState(grpc, event.params.id)
      const current = state.phases.find((p) => p.id === state.currentPhaseId)
      if (!current) {
        return fail(400, {
          message: "This hackathon has no current phase to take settings from",
        })
      }

      const enabled = withPhaseCapabilitiesEnabled(
        state.enabled,
        current.capabilities as number[],
      )
      await grpc.hackathon.setCapabilities({
        hackathonId: event.params.id,
        capabilities: capabilityStates(enabled),
      })
    } catch (e) {
      const failure = toFailure(e)
      if (failure) return failure
      throw e
    }

    return { message: "", saved: true }
  },
}
