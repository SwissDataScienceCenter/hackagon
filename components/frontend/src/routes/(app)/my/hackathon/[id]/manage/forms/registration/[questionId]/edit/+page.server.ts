import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { answerCounts, questionFail } from "$lib/server/hackathon/questions"
import {
  parseQuestionForm,
  questionRows,
  readQuestionEcho,
} from "$lib/server/hackathon/registrationForm"
import { resolve } from "$app/paths"
import { error, fail, redirect } from "@sveltejs/kit"

// One existing question. `ListQuestions` and a find, because there is no
// `GetQuestion` RPC — the list is short by nature, so this costs one call and
// no ticket.

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageParticipants(myMembership ?? undefined, isAdmin)) {
    error(403, "Only this event's organizers can edit its registration form")
  }

  const { hackathon: client } = requireGrpc(event.locals.grpc)
  const [questions, counts] = await Promise.all([
    client.listQuestions({ hackathonId: hackathon.id }),
    answerCounts(client, hackathon.id),
  ])

  const question = questionRows(questions.questions).find(
    (q) => q.id === event.params.questionId,
  )
  if (!question) error(404, "That question no longer exists")

  return {
    hackathonId: hackathon.id,
    // The count is what locks the type, the options and the promotion to
    // mandatory — the backend refuses each of the three once anyone has answered,
    // so the form needs it to avoid offering a refusal.
    question: { ...question, answerCount: counts.get(question.id) ?? 0 },
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { hackathon: client } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    // Read before validating, so a refusal can re-render what was typed rather
    // than resetting the row to what the server still holds.
    const echo = readQuestionEcho(form)

    const parsed = parseQuestionForm(form)
    if (!parsed.ok) return fail(400, { message: parsed.message, values: echo })
    const { label, type, mandatory, order, options, publicAnswers } =
      parsed.values

    // Which fields this edit may carry depends on whether anyone has answered.
    // The backend refuses each of the three below on an answered question, so
    // sending one the organizer never changed would turn a label fix into a
    // refusal. Absent fields are left alone rather than cleared.
    const locked = (await answerCounts(client, event.params.id)).has(
      event.params.questionId,
    )

    try {
      await client.editQuestion({
        hackathonId: event.params.id,
        questionId: event.params.questionId,
        label,
        order,
        type: locked ? undefined : type,
        // `false` is always allowed — only a promotion to mandatory is refused —
        // so relaxing a required question stays possible after answers exist.
        mandatory: locked && mandatory ? undefined : mandatory,
        // Repeated fields have no "unset", so an empty list is how this says
        // "leave the options alone". They cannot change once answered anyway.
        options: locked ? [] : options,
        // Sent unconditionally, unlike the three above: `EditQuestion` accepts
        // it on an answered question, and it is the one field an organizer may
        // need to change *because* people have answered.
        publicAnswers,
      })
    } catch (e) {
      return questionFail(e, echo)
    }

    redirect(
      303,
      resolve(`/my/hackathon/${event.params.id}/manage/forms/registration`),
    )
  },
}
