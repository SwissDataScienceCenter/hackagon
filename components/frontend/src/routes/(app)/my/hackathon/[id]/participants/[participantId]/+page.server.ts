import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import {
  answersByParticipant,
  questionRows,
  type ParticipantAnswer,
} from "$lib/server/hackathon/registrationForm"
import { listVisibleTeams } from "$lib/server/hackathon/teams"
import { membershipBadgeLabel } from "$lib/utils/hackathonRole"
import { error } from "@sveltejs/kit"

/**
 * Who is reading this profile, which decides both how the answers are asked for
 * and what may be said about them.
 *
 * - `mine` — your own profile: every answer you gave, shared or not.
 * - `public` — anyone else's: only their answers to questions the organizer
 *   marked "show answers to participants".
 *
 * There is deliberately no organizer scope. This is the participant view — the
 * page says so, and the participants list it hangs off says so — and an
 * organizer opening it is opening it to see what a participant sees. Their
 * hackathon write would let the RPC hand over the whole form; not asking for it
 * is the point.
 */
export type AnswerScope = "mine" | "public"

/**
 * What this participant answered on the registration form, as far as the viewer
 * is allowed to know.
 *
 * The two `ListParticipantAnswers` shapes are not interchangeable, which is why
 * the scope picks between them:
 *
 * - **Named `user_id`** is refused for a caller who is neither that user nor
 *   holding hackathon write (`hackathon_service.go:1912`), so `mine` is the only
 *   scope that may use it.
 * - **No `user_id`** returns, to a caller without write, their own answers plus
 *   everybody's answers to the public questions. That is `public`: ask for the
 *   cohort and pick this person out of it.
 *
 * The `public` scope therefore normally gets a list the backend has already
 * filtered. An organizer is the exception — hackathon write makes that same call
 * return the whole cohort's whole form — so the filter is applied here too,
 * against `publicAnswers`. Without it this page would quietly show an organizer
 * more than the participant view it claims to be.
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

  // How many questions this viewer could be shown an answer to. On your own
  // profile that is the whole form, and it is what lets the page say "you have
  // not answered" — a claim only worth making about a form that exists. On
  // anyone else's it is the shared ones, a different number and a weaker claim:
  // a shared question with no answer may mean they skipped it, so the page does
  // not say either way.
  const visible =
    scope === "public" ? rows.filter((q) => q.publicAnswers) : rows
  const shown = new Set(visible.map((q) => q.id))

  return {
    questionCount: visible.length,
    answers: (answersByParticipant(rows, answers.answers)[userId] ?? []).filter(
      // A no-op for anyone the backend already filtered for. It is the organizer
      // this catches: their write access makes the unnamed call return every
      // answer to every question, and this page is not where they read those.
      (a) => shown.has(a.questionId),
    ),
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
  const { hackathon, myMembership } = await event.parent()
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
  // gates on hackathon-scoped `team:read` (`team_service.go:59`), which a member
  // holds only while `CAPABILITY_VIEW_TEAMS` is on — it asked for
  // `hackathon:read` until that capability landed, so opening this page was once
  // enough on its own.
  //
  // **Three outcomes, not two.** Nothing here may say "not on a team yet" unless
  // that is actually known: it is a claim about this person, and neither a
  // refused read nor a failed one is any basis for it. So `teamsPublished` false
  // means the viewer is not allowed to know, `teamsFailed` means we tried and
  // could not, and an empty `teams` with both false is the real answer.
  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))
  let teams: { id: string; name: string; projectTitle: string | null }[] = []
  let teamsPublished = true
  let teamsFailed = false
  try {
    const all = await listVisibleTeams(team, event.params.id)
    teamsPublished = all !== undefined
    teams = (all ?? [])
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

  // Who is reading, and therefore how much of the form they get. Your own
  // profile shows your whole form; everyone else's shows what this event chose
  // to share, which is what the participants list is otherwise too thin to tell
  // you. An organizer is nobody special here — see `AnswerScope`.
  //
  // Failure is swallowed, unlike the teams call above: an absent section says
  // "nothing to show here", which is already an honest outcome, while "not on a
  // team" is a claim about the person that a failed load is no basis for.
  const isMe = myMembership?.user?.id === user.id
  const answerScope: AnswerScope = isMe ? "mine" : "public"
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
    // list is allowed to mean. On your own profile an empty list is "answered
    // nothing", which is worth saying; on anyone else's it is "nothing shared",
    // which is not a fact about the person and so draws no section at all.
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
    teamsPublished,
    teamsFailed,
  }
}
