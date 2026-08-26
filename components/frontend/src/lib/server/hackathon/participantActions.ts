// Every write against a hackathon's membership — approve, remove, promote,
// demote — extracted from the route that used to own them all.
//
// They live here because Manage Participants split in two: that page keeps the
// confirmed roster and its owner controls, and Waitlist took the approval queue,
// so `approve` and `remove` genuinely have two callers. Server-only: it reaches
// the generated client directly.
//
// Each is a plain action body taking the hackathon id, the same shape
// `stateActions` uses, so a route wires one up as
// `approve: (event) => approveParticipant(event, event.params.id)`.

import type { ActionFailure, RequestEvent } from "@sveltejs/kit"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * Spelled out rather than inferred, and the reason is not style: SvelteKit builds
 * a route's `ActionData` from what its actions are *inferred* to return, and an
 * action that delegates to an imported function loses the `fail()` shape on the
 * way — leaving the page with a `form` prop that has no `message` on it. Naming
 * the union here is what keeps `{form?.message}` type-checking on both pages.
 */
type ParticipantActionResult =
  | ActionFailure<{ message: string }>
  | Record<string, never>

/** The gRPC errors every write on this path can return, as SvelteKit failures. */
function failFor(e: unknown, denied: string) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
    return fail(403, { message: denied })
  }
  if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
    return fail(404, { message: "That participant no longer exists" })
  }
  // RemoveOwner refuses the last owner rather than leaving the hackathon with
  // nobody holding `hackathon:write` (`hackathon_service.go:1007`).
  if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
    return fail(409, { message: e.details || "That change isn't allowed" })
  }
  throw e
}

function userIdFrom(form: FormData): string | undefined {
  const id = form.get("userId")
  return typeof id === "string" && id !== "" ? id : undefined
}

/**
 * Every action here reads one `userId` and calls one RPC, so the four differ
 * only in which RPC and which refusal message. Written once rather than four
 * near-identical bodies, which is what the two pages inherited from each other.
 */
async function onParticipant(
  event: RequestEvent,
  denied: string,
  call: (userId: string) => Promise<unknown>,
): Promise<ParticipantActionResult> {
  const userId = userIdFrom(await event.request.formData())
  if (!userId) return fail(400, { message: "No participant was given" })

  try {
    await call(userId)
  } catch (e) {
    return failFor(e, denied)
  }

  return {}
}

/** Let a waitlisted applicant in. Offered on the Waitlist tab only. */
export function approveParticipant(
  event: RequestEvent,
  hackathonId: string,
): Promise<ParticipantActionResult> {
  const { hackathon } = requireGrpc(event.locals.grpc)

  return onParticipant(
    event,
    "You don't have permission to approve participants here",
    (userId) => hackathon.approveParticipant({ hackathonId, userId }),
  )
}

/**
 * Drop a membership row. Both tabs offer it: on the roster it removes a
 * confirmed participant, on the Waitlist it declines an application — the same
 * RPC either way, since a waitlisted row is a membership like any other.
 */
export function removeParticipant(
  event: RequestEvent,
  hackathonId: string,
): Promise<ParticipantActionResult> {
  const { hackathon } = requireGrpc(event.locals.grpc)

  return onParticipant(
    event,
    "You don't have permission to remove participants here",
    (userId) => hackathon.removeParticipant({ hackathonId, userId }),
  )
}

/**
 * AddOwner grants the casbin Owner role on top of the Member row rather than
 * replacing it, so a promoted participant keeps every member-level policy.
 */
export function promoteParticipant(
  event: RequestEvent,
  hackathonId: string,
): Promise<ParticipantActionResult> {
  const { hackathon } = requireGrpc(event.locals.grpc)

  return onParticipant(
    event,
    "You don't have permission to add owners here",
    (userId) => hackathon.addOwner({ hackathonId, userId }),
  )
}

export function demoteParticipant(
  event: RequestEvent,
  hackathonId: string,
): Promise<ParticipantActionResult> {
  const { hackathon } = requireGrpc(event.locals.grpc)

  return onParticipant(
    event,
    "You don't have permission to remove owners here",
    (userId) => hackathon.removeOwner({ hackathonId, userId }),
  )
}
