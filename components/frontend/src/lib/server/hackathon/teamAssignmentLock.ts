import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import type { HackathonState } from "$lib/server/grpc/generated/hackathon/entities/hackathon_state"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import { enabledCapabilities } from "./phaseForm"

/**
 * Server-only: reads generated types, so it must never be imported by a
 * component.
 */

/**
 * Why the teams themselves are fixed — empty while they are not.
 *
 * Fixed means no team may be added or deleted, and so no upload, which
 * replaces every team. People may still be moved by hand and teams renamed:
 * that is how an organizer handles someone dropping out late. Two things fix
 * the teams, each because rebuilding them would pull the ground from under
 * somebody:
 *
 * - **a submission exists.** A deleted team takes its submissions with it.
 * - **teams are published** (`CAPABILITY_VIEW_TEAMS`). Participants have been
 *   told which team they are on; replacing the teams changes that behind their
 *   backs.
 *
 * Either one is enough, and the reasons are listed so the page can say which.
 *
 * TODO(backend: team-assignment-lock): this is a frontend rule only. The page
 * stops offering the controls and its save action refuses a plan that adds or
 * deletes a team, but `TeamService` still accepts that from any other caller.
 * Planned as a backend check in a follow-up pull request; the frontend can
 * then keep this for the explanation and rely on the error for the rule.
 */
export async function assignmentLockReasons(
  team: TeamServiceClient,
  teamIds: readonly string[],
  state: HackathonState | undefined,
): Promise<string[]> {
  const published = enabledCapabilities(state).includes(
    Capability.CAPABILITY_VIEW_TEAMS,
  )

  // `TeamService.List` does not load submissions, so each team is asked. A
  // refusal or failure counts as "cannot tell", which locks: unlocking wrongly
  // can delete a submission, locking wrongly costs a reload.
  let submissions: number | null = 0
  try {
    const counts = await Promise.all(
      teamIds.map(async (teamId) => {
        const { submissions } = await team.listSubmissions({ teamId })

        return submissions.length
      }),
    )
    submissions = counts.reduce((n, c) => n + c, 0)
  } catch {
    submissions = null
  }

  return lockReasons({ submissions, published })
}

/** The reasons as the page shows them, most decisive first. */
export function lockReasons({
  submissions,
  published,
}: {
  /** How many submissions exist, or `null` when that could not be checked. */
  submissions: number | null
  published: boolean
}): string[] {
  const reasons: string[] = []
  if (submissions === null) {
    reasons.push("submissions could not be checked")
  } else if (submissions > 0) {
    reasons.push(
      `${submissions} ${submissions === 1 ? "submission exists" : "submissions exist"}`,
    )
  }
  if (published) reasons.push("teams are published")

  return reasons
}
