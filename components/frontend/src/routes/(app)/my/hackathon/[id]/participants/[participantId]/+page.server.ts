import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { membershipBadgeLabel } from "$lib/utils/hackathonRole"
import { error } from "@sveltejs/kit"

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
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)

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

  return {
    hackathonId: event.params.id,
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
