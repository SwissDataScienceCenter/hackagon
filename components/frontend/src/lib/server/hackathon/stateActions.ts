// Every write against a hackathon's capability switches and its current-phase
// pointer, extracted from the timeline route that used to own them all.
//
// They live here because the capability switches moved to the Manage Hackathon
// hub while the timeline kept the phase list and its per-phase "Make current"
// buttons — so `setCurrent` genuinely has two callers, and an action can only be
// reached from the route that declares it. Server-only: it reaches the generated
// client and the `Capability` enum directly.
//
// Extraction only. Every rule and every comment below came across from
// `timeline/+page.server.ts` unchanged; nothing about what these RPCs do or when
// they refuse was decided here.

import type { RequestEvent } from "@sveltejs/kit"
import { requireGrpc } from "$lib/server/grpc/client"
import {
  CAPABILITY_ORDER,
  capabilityStates,
  enabledCapabilities,
  phaseCapabilities,
} from "$lib/server/hackathon/phaseForm"
import {
  currentAndNextPhase,
  withPhaseCapabilitiesEnabled,
} from "$lib/utils/phase"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/** Shared translation: every action here writes through the same two RPCs. */
export function toCapabilityFailure(e: unknown) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
    return fail(403, {
      message: "You don't have permission to change this hackathon",
    })
  }
  // On `SetCapabilities` a NotFound now means one thing only: the HACKATHON does
  // not exist. It used to also mean "one capability in the batch has no stored
  // row", which refused all six and reported the wrong missing thing; that case
  // creates the row instead (`hackathon_service.go`, SetCapabilities). So a 404
  // reaching a viewer here is a hackathon that was deleted under them, and
  // `e.details` names it.
  if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
    return fail(404, { message: e.details })
  }
  if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
    return fail(400, { message: e.details })
  }

  return undefined
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
    enabled: enabledCapabilities(hackathon?.capabilities),
    currentPhaseId: hackathon?.currentPhaseId ?? "",
    phases: hackathon?.phases ?? [],
    // The rows themselves: a phase's capabilities are read from their
    // open_in_phase_id, not from the phase.
    capabilities: hackathon?.capabilities ?? [],
  }
}

/**
 * Declare a phase current, or clear the declaration when `phaseId` is absent.
 * `AdvancePhase` reads an empty string as "clear", which is why the clear form
 * simply omits the field.
 *
 * DOES apply capabilities, by design on this branch: a capability names the
 * phase it opens in (`open_in_phase_id`), and AdvancePhase switches exactly
 * those — closing any whose closing phase has passed — in the transaction that
 * moves the pointer. Capabilities with no phase linked are untouched and stay an
 * explicit act on the switches.
 */
export async function setCurrentPhase(
  event: RequestEvent,
  hackathonId: string,
) {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const form = await event.request.formData()
  const phaseId = form.get("phaseId")

  try {
    await hackathon.advancePhase({
      hackathonId,
      phaseId: typeof phaseId === "string" ? phaseId : "",
    })
  } catch (e) {
    const failure = toCapabilityFailure(e)
    if (failure) return failure
    throw e
  }

  return { message: "" }
}

/**
 * The six switches, saved together. `SetCapabilities` takes a full list of
 * states rather than a delta, and unchecked boxes submit nothing — hence
 * building the list from CAPABILITY_ORDER rather than from what arrived.
 */
export async function saveCapabilities(
  event: RequestEvent,
  hackathonId: string,
) {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const form = await event.request.formData()

  const checked = new Set(form.getAll("capabilities").map(String))
  const enabled = CAPABILITY_ORDER.filter((c) =>
    checked.has(String(c as number)),
  ).map((c) => c as number)

  try {
    await hackathon.setCapabilities({
      hackathonId,
      capabilities: capabilityStates(enabled),
    })
  } catch (e) {
    const failure = toCapabilityFailure(e)
    if (failure) return failure
    throw e
  }

  return { message: "", saved: true }
}

/**
 * Switch on whatever the current phase expects and is off. Additive only — see
 * `withPhaseCapabilitiesEnabled`; nothing is ever switched off here, so this
 * cannot close registration as a side effect of moving through phases.
 *
 * "Current" is resolved by `currentAndNextPhase`, which is the SAME answer the
 * hub used when it drew the warning this button sits under — an organiser's
 * declaration if there is one, otherwise whichever phase's own dates are
 * running. It used to be `phases.find(p => p.id === currentPhaseId)`, a second,
 * narrower definition of the word, and the two disagreed in the state most
 * hackathons are actually in: declaring a phase is an explicit act nobody has to
 * perform, so with no marker set the panel named the live phase off the calendar
 * and offered `Enable it`, and this action answered
 * `400 "…no current phase to take settings from"` every single time. The
 * control was offered exactly where it could not work.
 *
 * Resolving by dates here rather than hiding the warning, because the warning is
 * TRUE in that state — the phase the calendar says is running does name a
 * capability participants cannot use — and hiding a true, actionable warning
 * behind a marker nobody is required to set would report the gap in fewer
 * situations than it exists in. Nothing about the phase POINTER moves: this
 * still writes only capability switches, and declaring a phase stays the
 * separate, deliberate act it is. `SetCapabilities` is additive here, so the
 * worst a by-dates resolution can do is switch on something the calendar says
 * should already be on.
 *
 * The 400 survives for the case that is genuinely impossible — no declaration
 * AND no phase whose dates cover today — where there is no phase to read a plan
 * from under either meaning of the word. Not reachable from the panel (with no
 * current phase there are no phase capabilities, so `unmet` is empty and the
 * warning does not render), so it stays a guard on a direct POST.
 */
export async function applyPhaseCapabilities(
  event: RequestEvent,
  hackathonId: string,
) {
  const grpc = requireGrpc(event.locals.grpc)

  try {
    const state = await readState(grpc, hackathonId)
    const { current } = currentAndNextPhase(
      state.phases,
      state.currentPhaseId || undefined,
    )
    if (!current) {
      return fail(400, {
        message:
          "No phase is current here — none is declared and no phase's dates " +
          "cover today — so there are no settings to take",
      })
    }

    const enabled = withPhaseCapabilitiesEnabled(
      state.enabled,
      phaseCapabilities(state.capabilities, current.id),
    )
    await grpc.hackathon.setCapabilities({
      hackathonId,
      capabilities: capabilityStates(enabled),
    })
  } catch (e) {
    const failure = toCapabilityFailure(e)
    if (failure) return failure
    throw e
  }

  return { message: "", saved: true }
}
