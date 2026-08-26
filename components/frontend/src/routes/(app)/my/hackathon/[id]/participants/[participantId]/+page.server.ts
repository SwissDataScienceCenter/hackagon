import type { PageServerLoad } from "./$types"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { requireGrpc } from "$lib/server/grpc/client"
import {
  answersByParticipant,
  questionRows,
  type ParticipantAnswer,
} from "$lib/server/hackathon/registrationForm"
import { membershipBadgeLabel } from "$lib/utils/hackathonRole"
import { error } from "@sveltejs/kit"

/**
 * Who is reading this profile, which decides both how the answers are asked for
 * and what may be said about them.
 *
 * - `organizer` — hackathon write, so every answer to every question.
 * - `mine` — your own profile: every answer you gave, public or not.
 * - `public` — a peer: only their answers to questions the organizer marked
 *   "show answers to participants".
 */
export type AnswerScope = "organizer" | "mine" | "public"

/**
 * What this participant answered on the registration form, as far as the viewer
 * is allowed to know.
 *
 * The two `ListParticipantAnswers` shapes are not interchangeable, which is why
 * the scope picks between them:
 *
 * - **Named `user_id`** is refused for a caller who is neither that user nor
 *   holding hackathon write (`hackathon_service.go:1912`) — the public-answers
 *   change did not relax it. So a peer cannot use it, even for a question whose
 *   answers are public.
 * - **No `user_id`** returns, to a caller without write, their own answers plus
 *   everybody's answers to the public questions. That is the peer's only route:
 *   ask for the cohort and pick this person out of it.
 *
 * A peer therefore gets a list the backend has already filtered, so nothing here
 * has to re-check `publicAnswers` — and nothing here could, since a private
 * answer never arrives to be filtered.
 */
async function registrationAnswers(
  client: ReturnType<typeof requireGrpc>["hackathon"],
  hackathonId: string,
  userId: string,
  scope: AnswerScope,
): Promise<{ questionCount: number; answers: ParticipantAnswer[] }> {
  const [questions, answers] = await Promise.all([
    client.listQuestions({ hackathonId }),
    client.listParticipantAnswers({
      hackathonId,
      userId: scope === "public" ? undefined : userId,
    }),
  ])
  const rows = questionRows(questions.questions)

  // How many questions this viewer could be shown an answer to. For an organizer
  // or for you on your own profile that is the whole form, and it is what lets
  // the page say "has not answered" — an accusation only worth making about a
  // form that exists. For a peer it is the public ones, which is a different
  // number and a weaker claim: a public question with no answer here may mean
  // they skipped it, so the page does not say either way.
  const visible =
    scope === "public" ? rows.filter((q) => q.publicAnswers) : rows

  return {
    questionCount: visible.length,
    answers: answersByParticipant(rows, answers.answers)[userId] ?? [],
  }
}

/**
 * One participant, as everyone else in the hackathon sees them. Reached from the
 * participants list, which is a name and a role chip and not enough to know who
 * you are about to team up with.
 *
 * No access check of its own, and no `user.get`: the layout's `hackathon.get`
 * already enforced `hackathon:read` and already returned every member with their
 * casbin role, waitlist flag and join date. This page is a projection of that
 * list, so it cannot show anyone the list would have hidden.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()
  const { hackathon: hackathonClient, team } = requireGrpc(event.locals.grpc)

  // Same filter as the list: `user` present and not waitlisted. Who has applied
  // and not been accepted is between the applicant and the organizer, so a
  // waitlisted id reads as "not here" rather than resolving — otherwise this
  // route would be the way around the list's own privacy rule. Manage
  // Participants is where a waitlisted person is visible, to the people who act
  // on them.
  const member = hackathon.members.find(
    (m) => m.user?.id === event.params.participantId && !m.isWaiting,
  )
  if (!member?.user) {
    error(404, "That participant is not in this hackathon.")
  }
  const user = member.user

  // Teams need an RPC of their own — `Hackathon` carries no teams edge. `List`
  // gates on hackathon-scoped `hackathon:read` (`team_service.go:59`), the same
  // permission the layout already passed, so every viewer who can open this page
  // can make this call.
  //
  // A failure here is reported rather than swallowed: an empty teams list and a
  // list that failed to load look identical on the page, and "not on a team yet"
  // is a claim about this person that we would have no basis for.
  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))
  let teams: { id: string; name: string; projectTitle: string | null }[] = []
  let teamsFailed = false
  try {
    const { teams: all } = await team.list({ hackathonId: event.params.id })
    teams = all
      .filter((t) => t.members.some((m) => m.id === user.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        projectTitle: projectTitles.get(t.projectId) ?? null,
      }))
  } catch (err) {
    event.locals.logger.warn(
      { err },
      "PARTICIPANT: team list failed, rendering the profile without teams",
    )
    teamsFailed = true
  }

  // Who is reading, and therefore how much of the form they get. Everyone gets
  // *something* now: a peer sees the answers this event chose to share, which is
  // what the participants list is otherwise too thin to tell them.
  //
  // Failure is swallowed, unlike the teams call above: an absent section says
  // "nothing to show here", which is already an honest outcome for a peer, while
  // "not on a team" is a claim about the person that a failed load is no basis
  // for.
  const isOrganizer = mayManageParticipants(
    myMembership ?? undefined,
    isGlobalAdmin,
  )
  const isMe = myMembership?.user?.id === user.id
  const answerScope: AnswerScope = isOrganizer
    ? "organizer"
    : isMe
      ? "mine"
      : "public"
  let answers: ParticipantAnswer[] = []
  let questionCount = 0
  try {
    ;({ questionCount, answers } = await registrationAnswers(
      hackathonClient,
      event.params.id,
      user.id,
      answerScope,
    ))
  } catch (err) {
    event.locals.logger.warn(
      { err },
      "PARTICIPANT: registration answers failed, rendering without them",
    )
  }

  return {
    hackathonId: event.params.id,
    // `answerScope` picks the line under the heading and decides what an empty
    // list is allowed to mean. For an organizer or for you, an empty list is
    // "answered nothing", which is worth saying; for a peer it is "nothing
    // shared", which is not a fact about the person and so draws no section at
    // all.
    answerScope,
    questionCount,
    answers,
    participant: {
      name: user.displayName || user.username,
      username: user.username,
      roleLabel: membershipBadgeLabel(member.isWaiting, member.role),
      joinedAt: member.joinedAt,
    },
    teams,
    teamsFailed,
  }
}
