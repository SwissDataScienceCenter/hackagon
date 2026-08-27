import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { questionFail } from "$lib/server/hackathon/questions"
import {
  parseQuestionForm,
  readQuestionEcho,
} from "$lib/server/hackathon/registrationForm"
import { resolve } from "$app/paths"
import { error, fail, redirect } from "@sveltejs/kit"

// One new question. Its own page rather than a blank form left open at the foot
// of the list: the list is a list, and a form that is always there is a form
// nobody asked for.

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageParticipants(myMembership ?? undefined, isAdmin)) {
    error(403, "Only this event's organizers can edit its registration form")
  }

  const { hackathon: client } = requireGrpc(event.locals.grpc)
  const { questions } = await client.listQuestions({
    hackathonId: hackathon.id,
  })

  return {
    hackathonId: hackathon.id,
    // Past the last one, so a question added without touching the field lands at
    // the end of the form. The highest existing position rather than the count:
    // positions need not be contiguous, and with questions at 1, 2 and 10 a
    // count would suggest 4 and put the new one in the middle.
    nextOrder:
      questions.reduce((highest, q) => Math.max(highest, q.order), 0) + 1,
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { hackathon: client } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    // Read before validating, so a refusal can re-render what was typed. These
    // are plain POSTs: without the echo, a duplicate key costs the organizer the
    // label, the type and the whole options list as well as the key.
    const echo = readQuestionEcho(form)

    const parsed = parseQuestionForm(form)
    if (!parsed.ok) return fail(400, { message: parsed.message, values: echo })

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
      return questionFail(e, echo)
    }

    redirect(
      303,
      resolve(`/my/hackathon/${event.params.id}/manage/forms/registration`),
    )
  },
}
