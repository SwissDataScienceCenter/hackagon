import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import {
  answerValues,
  parseAnswers,
  questionRows,
  type QuestionRow,
} from "$lib/server/hackathon/registrationForm"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// Answering a hackathon's registration questions.
//
// Deliberately NOT under /my/hackathon/[id]/: that subtree's layout calls
// `hackathon.get`, which refuses a caller who is not a confirmed member — and
// the two people who most need this page are someone who has not joined yet and
// someone sitting on the waiting list. So the hackathon's name comes from `list`
// instead, and the questions from `listQuestions`, which serves a public
// hackathon to anyone.

interface Target {
  name: string
  isMember: boolean
  isWaiting: boolean
}

/**
 * Which hackathon this is, and whether the caller is already in it.
 *
 * Two `list` calls rather than a `get`: the participant-filtered one carries
 * `viewerMembership`, which is what decides between `Join` and `SubmitAnswers`
 * below, and the public one covers the caller who is not a member yet. A private
 * hackathon the caller has no role in appears in neither, which is the same
 * answer `Join` would give.
 */
async function resolveTarget(
  client: ReturnType<typeof requireGrpc>["hackathon"],
  hackathonId: string,
  participantId: string | undefined,
): Promise<Target | undefined> {
  const [mine, publicOnes] = await Promise.all([
    participantId
      ? client.list({ participantId }).catch(() => ({ hackathons: [] }))
      : Promise.resolve({ hackathons: [] }),
    client
      .list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC })
      .catch(() => ({ hackathons: [] })),
  ])

  const joined = mine.hackathons.find((h) => h.id === hackathonId)
  if (joined) {
    return {
      name: joined.name,
      isMember: true,
      isWaiting: joined.viewerMembership?.isWaiting ?? false,
    }
  }

  const listed = publicOnes.hackathons.find((h) => h.id === hackathonId)
  if (listed) {
    return { name: listed.name, isMember: false, isWaiting: false }
  }

  return undefined
}

export const load: PageServerLoad = async (event) => {
  const { hackathon: client } = requireGrpc(event.locals.grpc)
  const hackathonId = event.params.id

  const target = await resolveTarget(
    client,
    hackathonId,
    event.locals.platformUser?.id,
  )
  if (!target) error(404, "Hackathon not found")

  let questions: QuestionRow[]
  try {
    const res = await client.listQuestions({ hackathonId })
    questions = questionRows(res.questions)
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "You cannot see this hackathon's registration questions")
    throw e
  }

  // Answers already on file, so the form opens filled in and can be corrected
  // rather than retyped. Its own call, not part of `get`, for the same reason
  // this route is not under `[id]`: a waitlisted caller has to reach it.
  let values: Record<string, string | boolean> = {}
  try {
    const res = await client.listParticipantAnswers({
      hackathonId,
      userId: undefined,
    })
    values = answerValues(res.answers)
  } catch {
    // Nobody has answered yet is the common case and returns an empty list, so a
    // failure here reads the same way: an empty form.
    values = {}
  }

  return {
    hackathonId,
    name: target.name,
    isMember: target.isMember,
    isWaiting: target.isWaiting,
    questions,
    values,
  }
}

export const actions: Actions = {
  default: async (event) => {
    const { hackathon: client } = requireGrpc(event.locals.grpc)
    const hackathonId = event.params.id

    const target = await resolveTarget(
      client,
      hackathonId,
      event.locals.platformUser?.id,
    )
    if (!target)
      return fail(404, { message: "This hackathon no longer exists" })

    // Re-read the questions rather than trusting the form: the answers are
    // validated against them, and an organizer may have changed them while this
    // page sat open.
    const { questions } = await client.listQuestions({ hackathonId })
    const answers = parseAnswers(
      await event.request.formData(),
      questionRows(questions),
    )

    try {
      if (target.isMember) {
        await client.submitAnswers({ hackathonId, answers })
      } else {
        // Joining and answering are one act for someone signing up: `Join`
        // validates the mandatory answers itself, so a half-finished form never
        // produces a membership.
        await client.join({ hackathonId, answers })
      }
    } catch (e) {
      if (e instanceof ClientError) {
        // TODO(backend: answer-upsert-sql): every answer write fails today.
        // Both `Join` and `SubmitAnswers` build their upsert as
        // `OnConflict().UpdateNewValues()` with no conflict target, which
        // Postgres rejects at parse time — so this branch is currently the
        // *only* outcome of a filled-in form, whatever the answers say.
        if (e.code === Status.INTERNAL)
          return fail(500, {
            message:
              "Answers cannot be saved yet — the backend refuses every " +
              "registration answer. This is a known backend defect.",
          })
        // Names the offending key ("missing mandatory answers: [conduct]"),
        // which is more use than anything generic. Also covers a closed
        // registration window and a finished hackathon.
        if (e.code === Status.FAILED_PRECONDITION)
          return fail(409, {
            message: e.details || "Some required answers are missing.",
          })
        // An enum answer that is not one of its options, or an unknown question.
        if (e.code === Status.INVALID_ARGUMENT)
          return fail(400, {
            message: e.details || "Some answers are not valid.",
          })
        // TODO(backend: waitlisted-answers): a waitlisted participant cannot
        // save. `SubmitAnswers` takes `hackathon:read`, and the `Member` role
        // that carries it is granted by `ApproveParticipant`, not by `Join` —
        // so someone on the waiting list holds a participant row and no role.
        // Their answers are exactly what an organizer reads to decide, so this
        // reports the refusal accurately rather than pretending it cannot happen.
        if (e.code === Status.PERMISSION_DENIED)
          return fail(403, {
            message:
              target.isMember && target.isWaiting
                ? "Your answers cannot be changed while you are on the waiting list."
                : target.isMember
                  ? "You are not registered for this hackathon."
                  : "Registration is closed for this hackathon.",
          })
        if (e.code === Status.NOT_FOUND)
          return fail(404, { message: "This hackathon no longer exists" })
      }
      throw e
    }

    // A first-time answer ends the signup, so it leaves for the dashboard, where
    // the hackathon has moved into "Your hackathons" with its badge. An edit
    // stays put: the person came to change one answer, not to go somewhere.
    if (!target.isMember) redirect(303, "/dashboard")

    return { saved: true }
  },
}
