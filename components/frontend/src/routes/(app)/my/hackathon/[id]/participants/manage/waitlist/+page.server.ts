import type { Actions, PageServerLoad } from "./$types"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import {
  approveParticipant,
  removeParticipant,
} from "$lib/server/hackathon/participantActions"
import {
  answersByParticipant,
  questionRows,
  type ParticipantAnswer,
} from "$lib/server/hackathon/registrationForm"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"

/**
 * The approval queue: everyone who has asked to join and not been let in.
 *
 * Split off Manage Participants, which mixed them into the roster behind a
 * "Waitlisted" label — so the roster count included people who are not in the
 * hackathon yet, and the only queue an organizer has to work through had no
 * surface of its own. Settings badges this page with the count.
 *
 * This is the one page that keeps the registration answers inline, as a fold-out
 * per row. Deciding whether to let someone in *is* reading what they wrote, and
 * a waitlist is a page you work down once rather than a roster you come back to,
 * so a queue of tables is the right shape here and was the wrong one there.
 */
async function registrationAnswers(
  client: ReturnType<typeof requireGrpc>["hackathon"],
  hackathonId: string,
): Promise<{
  questionCount: number
  byParticipant: Record<string, ParticipantAnswer[]>
}> {
  try {
    const [questions, answers] = await Promise.all([
      client.listQuestions({ hackathonId }),
      client.listParticipantAnswers({ hackathonId, userId: undefined }),
    ])
    const rows = questionRows(questions.questions)

    return {
      questionCount: rows.length,
      byParticipant: answersByParticipant(rows, answers.answers),
    }
  } catch {
    // Swallowed: this page exists to approve and decline, and the answers
    // decorate that. A hackathon asking nothing renders identically.
    return { questionCount: 0, byParticipant: {} }
  }
}

export const load: PageServerLoad = async (event) => {
  // No RPC of its own for the queue: the layout's `hackathon.get` already
  // returns every member with their waitlist flag.
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()

  // Frontend-only gate, same as the roster tab beside it: the two RPCs below
  // enforce it for real. Stricter than that page in what it exposes, though —
  // who has applied and not been accepted is between the applicant and the
  // organizer, which is why the participant list drops these people entirely.
  if (!mayManageParticipants(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "Only the hackathon organizer can manage participants")
  }

  const { hackathon: client } = requireGrpc(event.locals.grpc)
  const { questionCount, byParticipant } = await registrationAnswers(
    client,
    hackathon.id,
  )

  const waiting = hackathon.members
    .filter((m) => m.user !== undefined && m.isWaiting)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
      username: m.user!.username,
      appliedAt: m.joinedAt,
      answers: byParticipant[m.user!.id] ?? [],
    }))

  return {
    hackathonId: hackathon.id,
    waiting,
    questionCount,
    // For the tab bar, which names the other half's size from either side.
    confirmedCount: hackathon.members.filter(
      (m) => m.user !== undefined && !m.isWaiting,
    ).length,
  }
}

// Decline is `remove`, the same RPC the roster's Remove calls: a waitlisted row
// is a membership like any other, and dropping it is what refusing an
// application means. Named for what it does to the applicant, not for the RPC.
export const actions: Actions = {
  approve: (event) => approveParticipant(event, event.params.id),
  decline: (event) => removeParticipant(event, event.params.id),
}
