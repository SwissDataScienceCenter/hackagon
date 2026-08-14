import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import {
  labelledAnswers,
  labelledConsents,
} from "$lib/utils/registrationAnswers"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// One participant's standing IN THIS HACKATHON — role, waitlist state, and the
// answers they gave this event's registration form. Deliberately not a global
// profile page: membership and role are per-hackathon casbin facts and a form
// response belongs to one event, so there is nothing here that would be the same
// on another event's copy of the same person.

export const load: PageServerLoad = async (event) => {
  // The layout's `hackathon.get` already carries every member with their casbin
  // role and waitlist flag, so the roster and this page never disagree about
  // who is in what state.
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()
  const { hackathon: hackathonClient } = requireGrpc(event.locals.grpc)

  // Gated on managing participants rather than on merely reading the roster:
  // the content of this page is someone else's personal data. The backend is
  // still the authority — `GetRegistrationResponse` enforces hackathon `Write`
  // for any user_id that is not the caller's own — and this only avoids
  // rendering a page whose whole point that RPC would refuse.
  if (!mayManageParticipants(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "You don't have permission to view participants here")
  }

  // Cross-hackathon leakage is closed by construction: `members` is this
  // hackathon's roster, so a userId belonging to another event is simply not in
  // it. Waitlisted people ARE, and are exactly who an organiser opens this for
  // before approving them.
  const member = hackathon.members.find(
    (m) => m.user?.id === event.params.userId,
  )
  const user = member?.user
  if (!member || !user) {
    error(404, "That person is not part of this hackathon")
  }

  // The registration answers are the SECOND thing on this page; who the person
  // is, and what their standing is, came out of the layout's `hackathon.get`
  // above and is already known to be readable. So a failure here degrades this
  // one section and nothing else — the same call the layout makes for the
  // sidebar's page list, and for the same reason.
  //
  // Nothing but PermissionDenied ends the page. In particular NOT_FOUND does
  // not: `GetRegistrationResponse` answers `submitted: false` for "no form on
  // file", so the only NotFound it can return is about the CALLER's own user
  // row (`hackathon_service.go:1893`) — a fact about who is asking, which used
  // to be reported as "that person is not part of this hackathon", a claim
  // about someone else that the roster lookup above had just disproved.
  let registration:
    | Awaited<ReturnType<typeof hackathonClient.getRegistrationResponse>>
    | undefined
  try {
    registration = await hackathonClient.getRegistrationResponse({
      hackathonId: event.params.id,
      userId: event.params.userId,
    })
  } catch (e) {
    // The one disagreement worth ending the page for: this page is gated on
    // managing participants and the RPC enforces the same hackathon `write`,
    // so a refusal here means the gate above was wrong about the reader, not
    // that one section is missing.
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to read these answers")
    }
    event.locals.logger.warn(
      { err: e },
      "PARTICIPANT: registration read failed, rendering the person without it",
    )
  }

  const formFields = hackathon.registrationForm?.fields ?? []
  const formConsents = hackathon.registrationForm?.consents ?? []

  // Who typed the answers in, when that was not the registrant — the check-in
  // desk filling in a paper form. Named from the roster rather than printing the
  // raw uuid; someone who has since left resolves to nothing and the line is
  // omitted.
  const memberNames = new Map(
    hackathon.members
      .filter((m) => m.user !== undefined)
      .map((m) => [m.user!.id, m.user!.displayName || m.user!.username]),
  )

  return {
    hackathonId: hackathon.id,
    person: {
      id: user.id,
      name: user.displayName || user.username,
      username: user.username,
      email: user.email,
      affiliation: user.affiliation,
      skills: user.skills,
      dietary: user.dietary,
      avatarUrl: user.avatarUrl,
    },
    membership: {
      role: member.role,
      isWaiting: member.isWaiting,
      joinedAt: member.joinedAt,
    },
    registration: {
      // The read failed and the section says so. Distinct from every state
      // below, all of which are claims about this person: "unavailable" is a
      // claim about the REQUEST, and rendering it as "asks no questions" or
      // "not filled in yet" would put a fact on screen that nobody checked.
      unavailable: registration === undefined,
      // `submitted: false` is the RPC's normal answer for "not filled in yet"
      // (it only errors when the *caller* has no account), so an empty form is
      // a state to render, never a failure.
      submitted: registration?.submitted ?? false,
      // Whether this event asks anything at all. Without a schema there is
      // nothing outstanding, and "not submitted yet" would read as a chase-up
      // that isn't one.
      hasForm: formFields.length > 0 || formConsents.length > 0,
      answers: labelledAnswers(registration?.responses, formFields),
      consents: labelledConsents(registration?.consents, formConsents),
      submittedAt: registration?.submittedAt,
      modifiedAt: registration?.modifiedAt,
      submittedByName: registration?.submittedById
        ? memberNames.get(registration.submittedById)
        : undefined,
    },
  }
}
