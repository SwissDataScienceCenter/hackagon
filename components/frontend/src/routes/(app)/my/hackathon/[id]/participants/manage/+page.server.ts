import type { Actions, PageServerLoad } from "./$types"
import { membershipBadgeLabel } from "$lib/utils/hackathonRole"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import {
  demoteParticipant,
  promoteParticipant,
  removeParticipant,
} from "$lib/server/hackathon/participantActions"
import { answeredParticipantIds } from "$lib/server/hackathon/registrationForm"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"

/**
 * Who has answered the registration form, and how many questions it asks.
 *
 * The answers themselves are deliberately not returned: this page shows a "No
 * answers" marker and links to the participant's page for the rest, so shipping
 * every answer of every participant to a roster that renders none of them would
 * be a payload nothing reads.
 *
 * Two RPCs of their own — the questions do not ride on `hackathon.get`, and the
 * answers have no home on it at all. Both are swallowed on failure: this page
 * exists to approve and remove people, and the marker decorates that. A
 * hackathon asking nothing returns two empty lists, which renders identically.
 *
 * `ListParticipantAnswers` returns the whole cohort to a caller holding
 * hackathon write and **silently narrows to the caller's own answers** without
 * it. This page already requires owner-or-admin, so write is expected — but if
 * the server's casbin policy is stale (it loads once at startup, so a fresh
 * `db::seed` leaves it behind) the effect is a roster where only the organizer
 * appears to have answered. That is the environment, not this code.
 */
async function answerStatus(
  client: ReturnType<typeof requireGrpc>["hackathon"],
  hackathonId: string,
): Promise<{ questionCount: number; answered: Set<string> }> {
  try {
    const [questions, answers] = await Promise.all([
      client.listQuestions({ hackathonId }),
      client.listParticipantAnswers({ hackathonId, userId: undefined }),
    ])

    return {
      questionCount: questions.questions.length,
      answered: answeredParticipantIds(answers.answers),
    }
  } catch {
    return { questionCount: 0, answered: new Set() }
  }
}

export const load: PageServerLoad = async (event) => {
  // No RPC of its own for the roster: the layout's `hackathon.get` already
  // returns every participant with their casbin role and waitlist flag.
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()
  const myUserId = myMembership?.user?.id

  // Frontend-only gate, same shape as the tracks and teams manage routes: the
  // RPCs below enforce it for real, this only decides whether the page
  // renders at all. The participant list itself stays reachable at
  // `../participants`, which every member may open.
  if (!mayManageParticipants(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "Only the hackathon organizer can manage participants")
  }

  // Confirmed members only. Waitlisted people used to be mixed in here carrying
  // a "Waitlisted" label, which made this page's count disagree with the number
  // of people actually in the hackathon and left the approval queue with no
  // surface of its own. They live on `./waitlist` now, which is where Approve is
  // — and the count in the tab bar above is how you find them.
  const members = hackathon.members.filter(
    (m) => m.user !== undefined && !m.isWaiting,
  )

  const { hackathon: client } = requireGrpc(event.locals.grpc)
  const { questionCount, answered } = await answerStatus(client, hackathon.id)

  const participants = members.map((m) => ({
    id: m.user!.id,
    name: m.user!.displayName || m.user!.username,
    roleLabel: membershipBadgeLabel(m.isWaiting, m.role),
    isOwner: m.role === HackathonRole.HACKATHON_ROLE_OWNER,
    // Demoting yourself would take away the `hackathon:write` this very page
    // needs, so the row for the viewer never offers it.
    isMe: myUserId !== undefined && m.user!.id === myUserId,
    // Read through the roster rather than off the answer list, which can hold
    // answers from people since removed — `RemoveParticipant` drops the
    // participant row and nothing drops their answers, so counting it directly
    // makes "12 of 10 answered" reachable.
    answered: answered.has(m.user!.id),
  }))

  // The export drops members with no address, since a blank one is a row a
  // mailing tool rejects (`User.email` is optional and defaults to empty). The
  // count is surfaced so a file shorter than the roster is not a silent
  // surprise; the addresses themselves stay out of this payload — the download
  // endpoint reads them from its own `Get`. Counted over the whole membership,
  // waitlisted included, because that is what the file contains.
  const withoutEmail = hackathon.members.filter(
    (m) => m.user !== undefined && m.user.email === "",
  ).length

  return {
    hackathonId: hackathon.id,
    participants,
    withoutEmail,
    questionCount,
    answeredCount: participants.filter((p) => p.answered).length,
    // For the tab bar, which names the other half's size from either side.
    waitingCount: hackathon.members.filter(
      (m) => m.user !== undefined && m.isWaiting,
    ).length,
  }
}

// Approve is deliberately absent: no row here is waitlisted, so it had nothing
// to act on. It lives on `./waitlist` with the rows it applies to.
export const actions: Actions = {
  remove: (event) => removeParticipant(event, event.params.id),
  promote: (event) => promoteParticipant(event, event.params.id),
  demote: (event) => demoteParticipant(event, event.params.id),
}
