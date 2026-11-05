import type { Team } from "$lib/server/grpc/generated/hackathon/entities/team"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * Server-only: reads generated types, so it must never be imported by a
 * component.
 */

/**
 * Every team in the hackathon, or `undefined` when team assignments are not
 * published.
 *
 * `TeamService.List` and `Get` require `team:read`
 * (`team_service.go:59,114`), and a member holds that only while
 * `CAPABILITY_VIEW_TEAMS` is switched on — `SetCapabilities` is what grants and
 * revokes the row (`hackathon_service.go:1100`). An owner holds it
 * unconditionally, from a default policy (`rbac.go:209`).
 *
 * So a refusal here is **not** a fault. It is an organiser who has not published
 * the assignments yet, and it is the steady state of every hackathon created
 * through the app, since a new one starts with every capability off. Two loads
 * called `List` with nothing around it when the RPC changed under them — the
 * submissions page and the ballot — and both turned the refusal into a 500. A
 * third, `teams/manage`, still does: it is owner-only, and an owner holds the
 * grant unconditionally, so the exposure there is a global admin who does not own
 * the hackathon.
 *
 * **Three outcomes, and callers need all three.** `undefined` is "you may not
 * see who is on which team", `[]` is "nobody has been put on a team yet", and a
 * throw is a real failure worth reporting. Collapsing the first two would have a
 * page claim a participant is on no team when it simply has not been told, which
 * is a claim about a person we would have no basis for.
 *
 * Nothing else is caught: a transport error or an Internal is still a genuine
 * problem, and swallowing it here would hide it from every caller at once.
 */
export async function listVisibleTeams(
  team: TeamServiceClient,
  hackathonId: string,
): Promise<Team[] | undefined> {
  try {
    const { teams } = await team.list({ hackathonId })

    return teams
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      return undefined
    }
    throw e
  }
}

/**
 * One team, for a page that is about it — or the 404/403 that page answers
 * instead. Shared by the team's page and its submission's page, which are
 * reached the same ways and refuse the same readers.
 *
 * `Get` gates on `team:read`, the grant `listVisibleTeams` explains, so a 403
 * here is assignments not being published rather than a fault.
 */
export async function teamOrError(
  team: TeamServiceClient,
  teamId: string,
): Promise<Team> {
  let found
  try {
    ;({ team: found } = await team.get({ teamId }))
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "That team does not exist.")
    }
    if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
      // A malformed id in the URL, not a missing team — same thing to a reader.
      error(404, "That team does not exist.")
    }
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You cannot view teams in this hackathon.")
    }
    throw e
  }
  if (!found) error(404, "That team does not exist.")

  return found
}
