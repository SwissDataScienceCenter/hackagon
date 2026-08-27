import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { listAnswers } from "$lib/server/hackathon/questions"
import {
  answerDistribution,
  answersByQuestion,
  questionRows,
} from "$lib/server/hackathon/registrationForm"
import { error } from "@sveltejs/kit"

// What the registration form actually collected. The builder next door is where
// the questions are written; this is where they are read.
//
// Read-only, deliberately: nothing here edits a question, because changing what
// was asked while looking at what was answered is how a form loses its meaning
// halfway through an event.

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageParticipants(myMembership ?? undefined, isAdmin)) {
    error(403, "Only this event's organizers can read the registration answers")
  }

  const { hackathon: client } = requireGrpc(event.locals.grpc)
  const [questions, answers] = await Promise.all([
    client.listQuestions({ hackathonId: hackathon.id }),
    listAnswers(client, hackathon.id),
  ])

  // Names come free: the layout's `hackathon.get` already returns every member
  // with their user record, so attributing an answer costs no extra call. Keyed
  // by user id, because that is what `Answer.participantId` holds.
  //
  // Waitlisted people are in it. They answered the form on the way in — that is
  // when the answers are collected — and leaving them out would report a
  // question as unanswered by people who have in fact answered it.
  const roster = new Map<string, string>()
  for (const m of hackathon.members) {
    if (m.user) roster.set(m.user.id, m.user.displayName || m.user.username)
  }

  const rows = questionRows(questions.questions, answers)
  const distribution = answerDistribution(rows, answers)
  const byQuestion = answersByQuestion(rows, answers, roster)

  return {
    hackathonId: hackathon.id,
    rosterSize: roster.size,
    // One view model per question rather than three parallel records the page
    // has to line up itself. `tally` is null for free text, which has no
    // distribution — a hundred different sentences counted once each is a list
    // of answers, not a summary of them.
    questions: rows.map((q) => ({
      id: q.id,
      key: q.key,
      label: q.label,
      kind: q.kind,
      mandatory: q.mandatory,
      publicAnswers: q.publicAnswers,
      tally: distribution[q.id] ?? null,
      answers: byQuestion[q.id]?.answers ?? [],
      missing: byQuestion[q.id]?.missing ?? 0,
    })),
  }
}
