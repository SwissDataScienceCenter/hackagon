import type { requireGrpc } from "$lib/server/grpc/client"
import type { QuestionEcho } from "$lib/server/hackathon/registrationForm"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * The plumbing the three registration-form routes share: how many answers a
 * question already has, and how a refused question RPC reads as an HTTP failure.
 *
 * Server-only, and split from `registrationForm.ts` on purpose: that module is
 * pure form reading and is unit-tested as such, while this one holds the gRPC
 * client and SvelteKit's `fail`. The list route, the create route and the edit
 * route each need both halves, and a rule spelled in three places is one that
 * drifts.
 */

type HackathonClient = ReturnType<typeof requireGrpc>["hackathon"]

/**
 * How many answers each question already has, keyed by question id.
 *
 * Read server-side rather than trusted from the form, because it decides which
 * fields an edit may carry: the backend refuses a type change, a promotion to
 * mandatory, and *any* options list once a question has been answered. Sending
 * a field the organizer did not touch would turn a label fix into a refusal.
 */
export async function answerCounts(
  client: HackathonClient,
  hackathonId: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  try {
    const res = await client.listParticipantAnswers({
      hackathonId,
      userId: undefined,
    })
    for (const a of res.answers) {
      counts.set(a.questionId, (counts.get(a.questionId) ?? 0) + 1)
    }
  } catch {
    // Answers are decoration on these pages — they lock controls, they are not
    // the point of them. A hackathon nobody has answered yet is the common case
    // and returns an empty list anyway, so a failure here reads the same way and
    // leaves the backend to refuse anything it should.
    return counts
  }

  return counts
}

/**
 * A refused question RPC, as a `fail()` the form page can render.
 *
 * `values` is what the organizer typed; it rides along so the page re-renders
 * their row instead of resetting it. Anything not recognised here is rethrown —
 * an unexpected code is a 500 and not a message beside a field.
 */
export function questionFail(e: unknown, values?: QuestionEcho) {
  const refuse = (status: number, message: string) =>
    fail(status, { message, values })

  if (e instanceof ClientError) {
    if (e.code === Status.ALREADY_EXISTS)
      return refuse(
        409,
        "A question with that key already exists in this hackathon. " +
          "Keys have to be unique, since they name the answers.",
      )
    // The edit guards: type changed, promoted to mandatory, or options touched
    // on a question people have already answered. The backend names which.
    if (e.code === Status.FAILED_PRECONDITION)
      return refuse(
        409,
        e.details ||
          "This question has answers already, so that part of it is fixed.",
      )
    if (e.code === Status.PERMISSION_DENIED)
      return refuse(403, "Only this event's organizers can do that.")
    if (e.code === Status.INVALID_ARGUMENT)
      return refuse(400, e.details || "That question is not valid.")
    if (e.code === Status.NOT_FOUND)
      return refuse(404, "That question no longer exists.")
  }
  throw e
}
