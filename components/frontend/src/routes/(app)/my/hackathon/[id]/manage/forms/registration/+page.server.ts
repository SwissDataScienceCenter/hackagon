import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import {
  parseQuestionForm,
  questionRows,
} from "$lib/server/hackathon/registrationForm"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// What this event asks people when they register, and which of the answers the
// rest of the cohort gets to read.
//
// One question per row, one RPC per row: there is no whole-form save, so each
// row is its own form and each save is a `CreateQuestion` / `EditQuestion` /
// `RemoveQuestion` of its own. That is the API's shape, not a choice — and it
// means a failure affects one question rather than the lot.

/**
 * How many answers each question already has, keyed by question id.
 *
 * Read server-side rather than trusted from the form, because it decides which
 * fields an edit may carry: the backend refuses a type change, a promotion to
 * mandatory, and *any* options list once a question has been answered. Sending
 * a field the organizer did not touch would turn a label fix into a refusal.
 */
async function answerCounts(
  client: ReturnType<typeof requireGrpc>["hackathon"],
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
    // Answers are decoration on this page — they lock controls, they are not the
    // point of it. A hackathon nobody has answered yet is the common case and
    // returns an empty list anyway, so a failure here reads the same way and
    // leaves the backend to refuse anything it should.
    return counts
  }

  return counts
}

function questionFail(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.ALREADY_EXISTS)
      return fail(409, {
        message:
          "A question with that key already exists in this hackathon. " +
          "Keys have to be unique, since they name the answers.",
      })
    // The edit guards: type changed, promoted to mandatory, or options touched
    // on a question people have already answered. The backend names which.
    if (e.code === Status.FAILED_PRECONDITION)
      return fail(409, {
        message:
          e.details ||
          "This question has answers already, so that part of it is fixed.",
      })
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only this event's organizers can do that." })
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details || "That question is not valid." })
    if (e.code === Status.NOT_FOUND)
      return fail(404, { message: "That question no longer exists." })
  }
  throw e
}

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageParticipants(myMembership ?? undefined, isAdmin)) {
    error(403, "Only this event's organizers can edit its registration form")
  }

  const { hackathon: client } = requireGrpc(event.locals.grpc)

  // `listQuestions` needs its own call: the questions do not ride on
  // `hackathon.get` the way tracks and phases do.
  const [questions, counts] = await Promise.all([
    client.listQuestions({ hackathonId: hackathon.id }),
    answerCounts(client, hackathon.id),
  ])

  return {
    hackathonId: hackathon.id,
    questions: questionRows(questions.questions).map((q) => ({
      ...q,
      answerCount: counts.get(q.id) ?? 0,
    })),
  }
}

export const actions: Actions = {
  create: async (event) => {
    const { hackathon: client } = requireGrpc(event.locals.grpc)
    const parsed = parseQuestionForm(await event.request.formData())
    if (!parsed.ok) return fail(400, { message: parsed.message })

    const { key, label, type, mandatory, order, options, publicAnswers } =
      parsed.values
    try {
      await client.createQuestion({
        hackathonId: event.params.id,
        key,
        label,
        type,
        mandatory,
        order,
        options,
        publicAnswers,
      })
    } catch (e) {
      return questionFail(e)
    }

    return { created: true }
  },

  edit: async (event) => {
    const { hackathon: client } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const questionId = form.get("questionId")
    if (typeof questionId !== "string" || questionId === "") {
      return fail(400, { message: "No question was given" })
    }

    const parsed = parseQuestionForm(form)
    if (!parsed.ok) return fail(400, { message: parsed.message })
    const { label, type, mandatory, order, options, publicAnswers } =
      parsed.values

    // Which fields this edit may carry depends on whether anyone has answered.
    // The backend refuses each of the three below on an answered question, so
    // sending one the organizer never changed would turn a label fix into a
    // refusal. Absent fields are left alone rather than cleared.
    const locked = (await answerCounts(client, event.params.id)).has(questionId)

    try {
      await client.editQuestion({
        hackathonId: event.params.id,
        questionId,
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
      return questionFail(e)
    }

    return { edited: true }
  },

  remove: async (event) => {
    const { hackathon: client } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const questionId = form.get("questionId")
    if (typeof questionId !== "string" || questionId === "") {
      return fail(400, { message: "No question was given" })
    }

    try {
      await client.removeQuestion({
        hackathonId: event.params.id,
        questionId,
      })
    } catch (e) {
      return questionFail(e)
    }

    return { removed: true }
  },
}
