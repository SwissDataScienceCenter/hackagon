import type { Actions, PageServerLoad } from "./$types"
import { resolve } from "$app/paths"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import {
  approveParticipant,
  demoteParticipant,
  participantActionFailed,
  promoteParticipant,
  removeParticipant,
} from "$lib/server/hackathon/participantActions"
import {
  answersByParticipant,
  questionRows,
  type ParticipantAnswer,
} from "$lib/server/hackathon/registrationForm"
import { requireGrpc } from "$lib/server/grpc/client"
import { membershipBadgeLabel } from "$lib/utils/hackathonRole"
import { error, redirect } from "@sveltejs/kit"

/**
 * One person, and every decision an organizer can take about them.
 *
 * The organizer counterpart to `participants/[participantId]`, which stays the
 * participant view — read-only, and showing only the answers this event chose to
 * share, even when an organizer opens it. This route is where their hackathon
 * write is actually spent: until now there was nowhere on screen at all to read
 * the unshared answers an organizer collects, which is what they decide on.
 *
 * Same shape as `projects/manage/[projectId]`: the lists that lead here decide
 * nothing, and a judgement about a person is made on the page that shows the
 * person. Both tabs lead here — the roster for a confirmed member, the waitlist
 * for an applicant — and `from` carries which, so every action returns to the
 * list the organizer was working through.
 */
export const load: PageServerLoad = async (event) => {
  // No RPC for the person: the layout's `hackathon.get` already returns every
  // member with their casbin role, waitlist flag, join date and email.
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()

  // Frontend-only gate, the same helper both tabs use so the three surfaces
  // cannot disagree. The RPCs below enforce it for real.
  if (!mayManageParticipants(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "Only the hackathon organizer can manage participants")
  }

  // Waitlisted people resolve here, unlike on the participant route, which drops
  // them: who has applied and not been accepted is between the applicant and the
  // organizer, and this page is the organizer's.
  const member = hackathon.members.find(
    (m) => m.user?.id === event.params.participantId,
  )
  if (!member?.user) {
    error(404, "That participant is not in this hackathon.")
  }
  const user = member.user

  const isOwner = member.role === HackathonRole.HACKATHON_ROLE_OWNER
  const isMe = myMembership?.user?.id === user.id

  return {
    hackathonId: hackathon.id,
    participant: {
      id: user.id,
      name: user.displayName || user.username,
      username: user.username,
      // Empty rather than absent when unset: `User.email` is optional and
      // defaults to "", and the page says so outright — a missing address is why
      // the roster's CSV export is shorter than the roster.
      email: user.email,
      roleLabel: membershipBadgeLabel(member.isWaiting, member.role),
      isWaiting: member.isWaiting,
      // Named `joinedAt` on the wire whichever side of approval they are on; the
      // page reads it as "applied" for someone still waiting.
      joinedAt: member.joinedAt,
    },
    ...(await profileSections(event, user.id)),
    // Each flag is a thing this person is not already, plus the two guards that
    // are about the viewer rather than the subject.
    //
    // Removing an owner is deliberately never offered. `RemoveParticipant`
    // deletes the participant row and strips the `Member` role only
    // (`hackathon_service.go:810`), so an owner would keep their `Owner` grant
    // with no membership behind it — and the last one would leave the hackathon
    // with nobody holding `hackathon:write`. Demote first; the page says so.
    mayApprove: member.isWaiting,
    mayRemove: !isOwner,
    // Confirmed members only: `AddOwner` would grant the role to someone who has
    // not been let in yet, which is a decision made in the wrong order.
    mayPromote: !isOwner && !member.isWaiting,
    // Never on your own row — demoting yourself takes away the `hackathon:write`
    // this page runs on. The backend separately refuses the last owner.
    mayDemote: isOwner && !isMe,
    isMe,
    isOwner,
    // The tab this was opened from, carried so every action returns to it.
    from: tabFrom(event.url),
  }
}

/**
 * The two sections that need RPCs of their own: what this person answered, and
 * which teams they are on.
 *
 * Both are swallowed on failure, and both say so on the page rather than
 * rendering as empty — "answered nothing" and "not on a team" are claims about
 * the person that a failed call is no basis for.
 *
 * The answers are asked for **by name**. `ListParticipantAnswers` refuses a named
 * `user_id` to a caller who is neither that user nor holding hackathon write
 * (`hackathon_service.go:1912`), which this page's gate has already established,
 * and it returns the whole form rather than the shared subset. That is the
 * difference between this page and the participant one.
 */
async function profileSections(
  event: Parameters<PageServerLoad>[0],
  userId: string,
): Promise<{
  questionCount: number
  answers: ParticipantAnswer[]
  answersFailed: boolean
  teams: { id: string; name: string; projectTitle: string | null }[]
  teamsFailed: boolean
}> {
  const { hackathon: client, team } = requireGrpc(event.locals.grpc)
  const { hackathon } = await event.parent()

  let questionCount = 0
  let answers: ParticipantAnswer[] = []
  let answersFailed = false
  try {
    const [questions, filed] = await Promise.all([
      client.listQuestions({ hackathonId: hackathon.id }),
      client.listParticipantAnswers({ hackathonId: hackathon.id, userId }),
    ])
    const rows = questionRows(questions.questions)
    questionCount = rows.length
    answers = answersByParticipant(rows, filed.answers)[userId] ?? []
  } catch (err) {
    event.locals.logger.warn(
      { err },
      "PARTICIPANT MANAGE: registration answers failed, rendering without them",
    )
    answersFailed = true
  }

  // `TeamService.List` gates on hackathon-scoped `hackathon:read`
  // (`team_service.go:59`), which the layout already passed.
  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))
  let teams: { id: string; name: string; projectTitle: string | null }[] = []
  let teamsFailed = false
  try {
    const { teams: all } = await team.list({ hackathonId: hackathon.id })
    teams = all
      .filter((t) => t.members.some((m) => m.id === userId))
      .map((t) => ({
        id: t.id,
        name: t.name,
        projectTitle: projectTitles.get(t.projectId) ?? null,
      }))
  } catch (err) {
    event.locals.logger.warn(
      { err },
      "PARTICIPANT MANAGE: team list failed, rendering the profile without teams",
    )
    teamsFailed = true
  }

  return { questionCount, answers, answersFailed, teams, teamsFailed }
}

/**
 * Which tab this page was opened from — the roster, or the waitlist.
 *
 * Round-tripped through the URL rather than guessed from the person's current
 * state, because approving changes that state: an organizer working down the
 * waitlist must land back on the waitlist, not on the roster the approved person
 * has just joined. Only this app's own two words are ever echoed back, so a
 * hand-typed parameter cannot point the redirect anywhere else.
 */
function tabFrom(url: URL): "roster" | "waitlist" {
  return url.searchParams.get("from") === "waitlist" ? "waitlist" : "roster"
}

/** Where a decision lands: the tab it was taken from. */
function backToList(event: { params: { id: string }; url: URL }): never {
  const path = resolve(`/my/hackathon/${event.params.id}/participants/manage`)

  redirect(303, tabFrom(event.url) === "waitlist" ? `${path}/waitlist` : path)
}

/**
 * Approve and Remove return to the list; Make owner and Remove owner stay.
 *
 * Not an inconsistency: the first two take the person off the tab that is open —
 * an approved applicant leaves the waitlist, a removed member leaves the roster
 * and this page with it, since the participant row it reads is gone. A role
 * change leaves them exactly where they are, and staying is what shows the
 * organizer the new role took effect.
 */
export const actions: Actions = {
  approve: async (event) => {
    const result = await approveParticipant(event, event.params.id)
    if (participantActionFailed(result)) return result

    backToList(event)
  },

  // Both "Remove" on the roster and "Decline" on the waitlist: one RPC, and
  // which of the two it reads as depends only on where the person started.
  remove: async (event) => {
    const result = await removeParticipant(event, event.params.id)
    if (participantActionFailed(result)) return result

    backToList(event)
  },

  promote: (event) => promoteParticipant(event, event.params.id),
  demote: (event) => demoteParticipant(event, event.params.id),
}
