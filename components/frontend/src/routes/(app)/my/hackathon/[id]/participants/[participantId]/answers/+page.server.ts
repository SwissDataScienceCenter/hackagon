import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import {
  answerValues,
  parseAnswers,
  questionRows,
} from "$lib/server/hackathon/registrationForm"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// A confirmed member changing their own registration answers, inside the
// hackathon so the sidebar stays. /register/[id] is the same form for the people
// this layout refuses — someone signing up, someone on the waiting list — and
// keeps doing that job.
//
// Only ever your own answers: `SubmitAnswers` saves for the caller, whoever the
// URL names, so another participant's id here could only mislead. It reads as
// "not here", the same answer the profile above gives for an unknown id.

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  if (myMembership?.user?.id !== event.params.participantId) {
    error(404, "That participant is not in this hackathon.")
  }
  const { hackathon: client } = requireGrpc(event.locals.grpc)
  const hackathonId = event.params.id

  // Named by user id, as on /register: left unnamed, the RPC also returns
  // everybody's answers to the shared questions, and `answerValues` keys by
  // question — so a peer's answer would prefill this form as though it were
  // yours.
  const [questions, answers] = await Promise.all([
    client.listQuestions({ hackathonId }),
    client.listParticipantAnswers({
      hackathonId,
      userId: event.params.participantId,
    }),
  ])

  return {
    hackathonId,
    participantId: event.params.participantId,
    name: hackathon.name,
    questions: questionRows(questions.questions),
    values: answerValues(answers.answers),
  }
}

export const actions: Actions = {
  default: async (event) => {
    if (event.locals.platformUser?.id !== event.params.participantId) {
      return fail(404, {
        message: "That participant is not in this hackathon.",
      })
    }
    const { hackathon: client } = requireGrpc(event.locals.grpc)
    const hackathonId = event.params.id

    // Re-read the questions rather than trusting the form: the answers are
    // validated against them, and an organizer may have changed them while this
    // page sat open.
    const { questions } = await client.listQuestions({ hackathonId })
    const answers = parseAnswers(
      await event.request.formData(),
      questionRows(questions),
    )

    try {
      await client.submitAnswers({ hackathonId, answers })
    } catch (e) {
      if (e instanceof ClientError) {
        // Reported rather than thrown, so the answers just typed stay on screen.
        if (e.code === Status.INTERNAL)
          return fail(500, {
            message:
              "Something went wrong saving your answers. Please try again.",
          })
        // Names the offending key ("missing mandatory answers: [conduct]").
        if (e.code === Status.FAILED_PRECONDITION)
          return fail(409, {
            message: e.details || "Some required answers are missing.",
          })
        // An enum answer that is not one of its options, or an unknown question.
        if (e.code === Status.INVALID_ARGUMENT)
          return fail(400, {
            message: e.details || "Some answers are not valid.",
          })
        // Removed from the hackathon while the page was open.
        if (e.code === Status.PERMISSION_DENIED)
          return fail(403, {
            message: "You are no longer registered for this hackathon.",
          })
        if (e.code === Status.NOT_FOUND)
          return fail(404, { message: "This hackathon no longer exists" })
      }
      throw e
    }

    // Back to your profile, which shows the answers as saved — that is the
    // confirmation, and it is where "Edit answers" was clicked.
    redirect(
      303,
      `/my/hackathon/${hackathonId}/participants/${event.params.participantId}`,
    )
  },
}
