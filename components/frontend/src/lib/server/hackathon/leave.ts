// Taking yourself out of a hackathon. Two callers, one RPC: somebody still on
// the waitlist cancels their registration from the public page, and a confirmed
// participant leaves from their own profile inside the hackathon. `Leave` does
// the same thing to either — it deletes the participant row and everything that
// came with it — so only the wording around it differs.
//
// Server-only: it calls the generated client.

import type { HackathonServiceClient } from "$lib/server/grpc/generated/hackathon/hackathon_service"
import { ClientError, Status } from "nice-grpc-common"

/** Why `Leave` refused, as a status and a sentence for the page to show. */
export type LeaveRefusal = { status: number; message: string }

/**
 * Calls `Leave` for the signed-in user, and returns the refusal if there is one.
 *
 * `undefined` means the caller is out, which includes `NOT_FOUND`: `Leave`
 * answers that both for a hackathon that is gone and for a caller with no
 * participant row (`hackathon_service.go:880`). Either way the person is not in
 * it, which is what they asked for, so a second press — or a stale tab — goes
 * on as if it had worked.
 *
 * There is no `PERMISSION_DENIED` case: `Leave` has no casbin check, because the
 * only person it can remove is the caller.
 *
 * @param client takes only `leave`, so a test can hand in a stub.
 */
export async function leaveHackathon(
  client: Pick<HackathonServiceClient, "leave">,
  hackathonId: string,
): Promise<LeaveRefusal | undefined> {
  try {
    await client.leave({ hackathonId })
  } catch (e) {
    if (!(e instanceof ClientError)) throw e
    if (e.code === Status.NOT_FOUND) return undefined
    // Once it is over, the roster is the record of the event and stays as it is.
    if (e.code === Status.FAILED_PRECONDITION)
      return {
        status: 409,
        message:
          "This hackathon has already finished, so you stay on its list.",
      }
    if (e.code === Status.UNAUTHENTICATED)
      return {
        status: 401,
        message: "Your session has expired. Sign in again and try once more.",
      }
    throw e
  }

  return undefined
}
