import type { Actions, PageServerLoad } from "./$types"
import { membershipBadgeLabel } from "$lib/utils/hackathonRole"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { requireGrpc } from "$lib/server/grpc/client"
import {
  answersByParticipant,
  questionRows,
  type ParticipantAnswer,
} from "$lib/server/hackathon/registrationForm"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * What each participant answered on the registration form.
 *
 * Two RPCs of its own — the questions do not ride on `hackathon.get`, and the
 * answers have no home on it at all. Both are swallowed on failure: this page
 * exists to approve and remove people, and the answers decorate that. A
 * hackathon asking nothing returns two empty lists, which renders identically.
 *
 * `ListParticipantAnswers` returns the whole cohort to a caller holding
 * hackathon write and **silently narrows to the caller's own answers** without
 * it. This page already requires owner-or-admin, so write is expected — but if
 * the server's casbin policy is stale (it loads once at startup, so a fresh
 * `db::seed` leaves it behind) the effect is a roster where only the organizer
 * appears to have answered. That is the environment, not this code.
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
    return { questionCount: 0, byParticipant: {} }
  }
}

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // participant with their casbin role and waitlist flag.
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()
  const myUserId = myMembership?.user?.id

  // Frontend-only gate, same shape as the tracks and teams manage routes: the
  // two RPCs below enforce it for real, this only decides whether the page
  // renders at all. The participant list itself stays reachable at
  // `../participants`, which every member may open.
  if (!mayManageParticipants(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "Only the hackathon organizer can manage participants")
  }

  // Waitlisted members are listed too, carrying a "Waitlisted" label. They are
  // real rows in the hackathon's membership, and the label says which is which
  // — hiding them would make the page disagree with the count in the header,
  // and they are the rows Approve exists for.
  const { hackathon: client } = requireGrpc(event.locals.grpc)
  const { questionCount, byParticipant } = await registrationAnswers(
    client,
    hackathon.id,
  )

  const participants = hackathon.members
    .filter((m) => m.user !== undefined)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
      roleLabel: membershipBadgeLabel(m.isWaiting, m.role),
      isWaiting: m.isWaiting,
      isOwner: m.role === HackathonRole.HACKATHON_ROLE_OWNER,
      // Demoting yourself would take away the `hackathon:write` this very page
      // needs, so the row for the viewer never offers it.
      isMe: myUserId !== undefined && m.user!.id === myUserId,
      answers: byParticipant[m.user!.id] ?? [],
    }))

  // The export drops members with no address, since a blank one is a row a
  // mailing tool rejects (`User.email` is optional and defaults to empty). The
  // count is surfaced so a file shorter than the roster is not a silent
  // surprise; the addresses themselves stay out of this payload — the download
  // endpoint reads them from its own `Get`.
  const withoutEmail = hackathon.members.filter(
    (m) => m.user !== undefined && m.user.email === "",
  ).length

  // Counted through the roster rather than off `byParticipant`, which can hold
  // answers from people since removed — `RemoveParticipant` drops the
  // participant row and nothing drops their answers, so counting it directly
  // makes "12 of 10 answered" reachable.
  const answeredCount = participants.filter((p) => p.answers.length > 0).length

  return {
    hackathonId: hackathon.id,
    participants,
    withoutEmail,
    questionCount,
    answeredCount,
  }
}

/** The gRPC errors both write paths can return, as SvelteKit failures. */
function failFor(e: unknown, denied: string) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
    return fail(403, { message: denied })
  }
  if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
    return fail(404, { message: "That participant no longer exists" })
  }
  // RemoveOwner refuses the last owner rather than leaving the hackathon with
  // nobody holding `hackathon:write` (`hackathon_service.go:1007`).
  if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
    return fail(409, { message: e.details || "That change isn't allowed" })
  }
  throw e
}

function userIdFrom(form: FormData): string | undefined {
  const id = form.get("userId")
  return typeof id === "string" && id !== "" ? id : undefined
}

export const actions: Actions = {
  approve: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)

    const userId = userIdFrom(await event.request.formData())
    if (!userId) return fail(400, { message: "No participant was given" })

    try {
      await hackathon.approveParticipant({
        hackathonId: event.params.id,
        userId,
      })
    } catch (e) {
      return failFor(
        e,
        "You don't have permission to approve participants here",
      )
    }

    return {}
  },

  remove: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)

    const userId = userIdFrom(await event.request.formData())
    if (!userId) return fail(400, { message: "No participant was given" })

    try {
      await hackathon.removeParticipant({
        hackathonId: event.params.id,
        userId,
      })
    } catch (e) {
      return failFor(e, "You don't have permission to remove participants here")
    }

    return {}
  },

  // AddOwner grants the casbin Owner role on top of the Member row rather than
  // replacing it, so a promoted participant keeps every member-level policy.
  promote: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)

    const userId = userIdFrom(await event.request.formData())
    if (!userId) return fail(400, { message: "No participant was given" })

    try {
      await hackathon.addOwner({ hackathonId: event.params.id, userId })
    } catch (e) {
      return failFor(e, "You don't have permission to add owners here")
    }

    return {}
  },

  demote: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)

    const userId = userIdFrom(await event.request.formData())
    if (!userId) return fail(400, { message: "No participant was given" })

    try {
      await hackathon.removeOwner({ hackathonId: event.params.id, userId })
    } catch (e) {
      return failFor(e, "You don't have permission to remove owners here")
    }

    return {}
  },
}
