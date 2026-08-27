import type { PageServerLoad } from "./$types"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { answeredParticipantIds } from "$lib/server/hackathon/registrationForm"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"

/**
 * The approval queue: everyone who has asked to join and not been let in.
 *
 * The second tab of Manage Participants, and stricter than the roster beside it
 * in what it exposes — who has applied and not been accepted is between the
 * applicant and the organizer, which is why the participant list drops these
 * people entirely.
 *
 * Approve and Decline are **not** here. They live on the applicant's own page
 * under Manage, together with the registration answers they are a judgement of,
 * the same way a project is approved on the project rather than in the queue.
 * This page used to unfold those answers under every row and decide on the spot;
 * what that bought was a fast sweep, what it cost was deciding about somebody
 * from a row.
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
      // Only who has filed something, not what they filed: the answers
      // themselves are read one applicant at a time now, and shipping the whole
      // queue's form to a page that renders none of it would be a payload
      // nothing reads.
      answered: answeredParticipantIds(answers.answers),
    }
  } catch {
    // Swallowed: this page exists to lead an organizer to the people waiting,
    // and the marker decorates that. A hackathon asking nothing renders
    // identically.
    return { questionCount: 0, answered: new Set() }
  }
}

export const load: PageServerLoad = async (event) => {
  // No RPC of its own for the queue: the layout's `hackathon.get` already
  // returns every member with their waitlist flag.
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()

  // Frontend-only gate, same as the roster tab beside it: the RPCs the
  // applicant's page calls enforce it for real.
  if (!mayManageParticipants(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "Only the hackathon organizer can manage participants")
  }

  const { hackathon: client } = requireGrpc(event.locals.grpc)
  const { questionCount, answered } = await answerStatus(client, hackathon.id)

  const waiting = hackathon.members
    .filter((m) => m.user !== undefined && m.isWaiting)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
      username: m.user!.username,
      appliedAt: m.joinedAt,
      // Read through the queue rather than off the answer list, which outlives
      // the people on it: `RemoveParticipant` drops the participant row and
      // nothing drops their answers.
      answered: answered.has(m.user!.id),
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
