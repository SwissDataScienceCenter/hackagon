import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { listAnswers, questionFail } from "$lib/server/hackathon/questions"
import {
  answerDistribution,
  questionRows,
} from "$lib/server/hackathon/registrationForm"
import { error, fail } from "@sveltejs/kit"

// What this event asks people when they register, and which of the answers the
// rest of the cohort gets to read.
//
// A list only: adding a question is `./new`, changing one is `./<id>/edit`, and
// the one write left here is the delete — the same split every other manage list
// in this app makes (phases, voting categories, tracks, pages). Every question
// used to render its own eight-field form open on this page, so a form with eight
// questions was nine open forms stacked down it.
//
// One RPC per question either way: there is no whole-form save, which is the
// API's shape rather than a choice here.

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
  const [questions, answers] = await Promise.all([
    client.listQuestions({ hackathonId: hackathon.id }),
    listAnswers(client, hackathon.id),
  ])

  const rows = questionRows(questions.questions, answers)

  return {
    hackathonId: hackathon.id,
    questions: rows,
    // What people actually chose, for the two kinds where that is a summary
    // rather than a list. Keyed by question id and computed here rather than in
    // the page, because it reads the answers — which are server-only, and which
    // the page has no other reason to hold.
    distribution: answerDistribution(rows, answers),
  }
}

export const actions: Actions = {
  // The one write on the list. It stays here rather than on the edit page for the
  // reason the other manage lists keep theirs on the row: a delete discards the
  // fields an edit form is showing, and offering both on one screen invites the
  // wrong button.
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
