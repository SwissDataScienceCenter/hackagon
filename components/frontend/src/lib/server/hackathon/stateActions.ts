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
// `saveCapabilities` is the only thing that writes casbin rows. Nothing here
// couples them, and nothing here may: advancing a phase must never change what
// participants are allowed to do.

import type { RequestEvent } from "@sveltejs/kit"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import {
  CAPABILITY_ORDER,
  capabilityStates,
  enabledCapabilities,
} from "$lib/server/hackathon/phaseForm"
import { votingRoundStatus } from "$lib/server/hackathon/voting"
import {
  mayPublishResults,
  type VotingRound,
} from "$lib/server/hackathon/votingSwitches"
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
 * Deliberately does *not* touch capabilities, and there is no longer anything
 * that does: moving between phases changes what the timeline says, never what
 * participants may do. That stays an explicit act on the switches.
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
  const { hackathon, vote } = requireGrpc(event.locals.grpc)
  const form = await event.request.formData()

  const checked = new Set(form.getAll("capabilities").map(String))
  const enabled = CAPABILITY_ORDER.filter((c) =>
    checked.has(String(c as number)),
  ).map((c) => c as number)

  // The one switch that can refuse — see `switchNote`. Only when "View
  // results" is being switched *on*: a hackathon that already shows them can
  // still save its other switches, and turning it off is never blocked. If the
  // voting state cannot be read, it is allowed rather than refused, so Settings
  // can never be stuck on a lookup.
  const viewResults = Capability.CAPABILITY_VIEW_RESULTS as number
  if (enabled.includes(viewResults)) {
    const { hackathon: h } = await hackathon.get({ hackathonId })
    const wasOn = enabledCapabilities(h?.state).includes(viewResults)
    if (!wasOn) {
      let round: VotingRound
      try {
        round = await votingRoundStatus(vote, hackathonId)
      } catch (e) {
        event.locals.logger.warn(
          { err: e },
          "SETTINGS: voting state lookup failed, allowing View results",
        )
        round = undefined
      }
      if (!mayPublishResults(round)) {
        return fail(409, {
          message:
            "Results can be published only once they are final. Make them final in Manage Voting first.",
        })
      }
    }
  }

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
