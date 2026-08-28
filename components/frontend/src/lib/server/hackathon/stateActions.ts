// Every write against a hackathon's `HackathonState` — the capability switches
// and the current-phase pointer — extracted from the route that used to own
// them all.
//
// They live here because the organiser's controls moved to a Settings page of
// their own while Manage Timeline kept the phase list and its per-phase
// "Make current" buttons, so `setCurrent` genuinely has two callers.
// Server-only: it reaches the generated client and the `Capability` enum
// directly.
//
// The two mechanisms stay strictly separate, as the backend keeps them:
// `setCurrentPhase` moves the pointer and grants nobody anything, and
// `setCapabilities` is the only thing that writes casbin rows. Nothing here
// couples them — `applyPhaseCapabilities` is the one bridge, and an organiser
// has to ask for it.

import type { RequestEvent } from "@sveltejs/kit"
import { requireGrpc } from "$lib/server/grpc/client"
import {
  CAPABILITY_ORDER,
  capabilityStates,
  enabledCapabilities,
} from "$lib/server/hackathon/phaseForm"
import { withPhaseCapabilitiesEnabled } from "$lib/utils/phase"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * Shared translation for every write on this path, including `setCurrent` over
 * on Manage Timeline — all of them go through the same two RPCs and can fail
 * the same three ways. Returns undefined for anything else, which the caller
 * rethrows.
 */
export function toCapabilityFailure(e: unknown) {
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

/**
 * Declare a phase current, or clear the declaration when `phaseId` is absent.
 *
 * `SetCurrentPhase` reads an empty string as "clear", which is why the clearing
 * form simply omits the field.
 *
 * Deliberately does *not* touch capabilities. Moving between phases changes what
 * the timeline says, never what participants may do — that stays an explicit act
 * on the switches, or one click on `applyPhaseCapabilities`.
 */
export async function setCurrentPhase(
  event: RequestEvent,
  hackathonId: string,
) {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const form = await event.request.formData()
  const phaseId = form.get("phaseId")

  try {
    await hackathon.setCurrentPhase({
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
 * The seven switches, saved together.
 *
 * `SetCapabilities` takes a full list of states rather than a delta, and
 * unchecked boxes submit nothing — hence building the list from
 * `CAPABILITY_ORDER` rather than from what arrived.
 *
 * Carries no permission check of its own. The Settings route it lives on
 * refuses a non-organiser in its `load`, and the backend's `hackathon:write` is
 * the real gate regardless — a participant who posts this by hand gets
 * PermissionDenied translated to a 403 above.
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
 * Switch on whatever the current phase expects and is off.
 *
 * Additive only — see `withPhaseCapabilitiesEnabled`; nothing is ever switched
 * off here, so this cannot close registration as a side effect of moving through
 * phases.
 *
 * Reads the hackathon fresh rather than trusting the client for what is
 * currently enabled or which phase is current: the union is computed against
 * live state, so a stale page cannot switch something back on that was just
 * turned off.
 */
export async function applyPhaseCapabilities(
  event: RequestEvent,
  hackathonId: string,
) {
  const grpc = requireGrpc(event.locals.grpc)

  try {
    const { hackathon } = await grpc.hackathon.get({ hackathonId })
    const currentPhaseId = hackathon?.state?.currentPhaseId ?? ""
    const current = (hackathon?.phases ?? []).find(
      (p) => p.id === currentPhaseId,
    )
    if (!current) {
      return fail(400, {
        message: "This hackathon has no current phase to take settings from",
      })
    }

    const enabled = withPhaseCapabilitiesEnabled(
      enabledCapabilities(hackathon?.state),
      current.capabilities as number[],
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
