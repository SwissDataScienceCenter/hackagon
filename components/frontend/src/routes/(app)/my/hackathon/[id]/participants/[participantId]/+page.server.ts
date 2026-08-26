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
 * What this participant answered on the registration form.
 *
 * Fetched only for a viewer the backend will actually answer for, which is why
 * the caller decides before calling: `ListParticipantAnswers` refuses a named
 * `user_id` that is neither the caller nor accompanied by hackathon write
 * (`hackathon_service.go:1907`). Asking it with no `user_id` instead is worse —
 * without write it silently narrows to the caller's own answers, which on
 * someone else's profile would render one person's answers under another
 * person's name.
 *
 * So peers see no answers section at all, rather than an empty or a wrong one.
 * Making a chosen subset of answers visible to the cohort needs a visibility
 * flag on the question and a backend that honors it; nothing is stubbed here in
 * the meantime.
 */
async function registrationAnswers(
  client: ReturnType<typeof requireGrpc>["hackathon"],
  hackathonId: string,
  userId: string,
): Promise<{ questionCount: number; answers: ParticipantAnswer[] }> {
  const [questions, answers] = await Promise.all([
    client.listQuestions({ hackathonId }),
    client.listParticipantAnswers({ hackathonId, userId }),
  ])
  const rows = questionRows(questions.questions)

  // The question count decides whether the section appears at all: a hackathon
  // that asks nothing has no form to have answered, and "has not answered" would
  // be an accusation about a form that does not exist.
  return {
    questionCount: rows.length,
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

  // Who may read the answers: an organizer, who reaches this page from Manage
  // Participants and used to read them in a fold-out there, and you on your own
  // profile. Both are paths `ListParticipantAnswers` answers honestly — see
  // `registrationAnswers` for why nobody else is offered them.
  //
  // Failure is swallowed, unlike the teams call above: an absent section says
  // "not shown here", which is already what a peer sees, while "not on a team"
  // is a claim about the person that a failed load is no basis for.
  const isOrganizer = mayManageParticipants(
    myMembership ?? undefined,
    isGlobalAdmin,
  )
  const isMe = myMembership?.user?.id === user.id
  const answersVisible = isOrganizer || isMe
  let answers: ParticipantAnswer[] = []
  let questionCount = 0
  if (answersVisible) {
    try {
      ;({ questionCount, answers } = await registrationAnswers(
        hackathonClient,
        event.params.id,
        user.id,
      ))
    } catch (err) {
      event.locals.logger.warn(
        { err },
        "PARTICIPANT: registration answers failed, rendering without them",
      )
    }
  }

  return {
    hackathonId: event.params.id,
    // `answersVisible` is what draws the section, not `answers.length`: an
    // organizer looking at someone who answered nothing must see that, and a peer
    // must see no section at all — the two are the same empty list otherwise.
    // `answersAreMine` picks the line under the heading: your own answers come
    // with the way to change them.
    answersVisible,
    answersAreMine: isMe,
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
