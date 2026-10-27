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
 * Fixed means no team may be deleted, and so no upload, which replaces every
 * team. People may still be moved by hand, teams renamed and new teams added:
 * that is how an organizer handles a late dropout or a late joiner. Two things fix
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
 * stops offering the controls and its save action refuses a plan that deletes
 * a team, but `TeamService` still accepts that from any other caller.
 * Planned as a backend check in a follow-up pull request; the frontend can
 * then keep this for the explanation and rely on the error for the rule.
 */
export async function assignmentLockReasons(
  team: TeamServiceClient,
  hackathonId: string,
  state: HackathonState | undefined,
): Promise<string[]> {
  const published = enabledCapabilities(state).includes(
    Capability.CAPABILITY_VIEW_TEAMS,
  )

  // Every team's submissions in one hackathon-scoped call, not only those on
  // approved projects: a submission anywhere in the hackathon is one a save
  // could take with it. A refusal or failure counts as "cannot tell", which
  // locks: unlocking wrongly can delete a submission, locking wrongly costs a
  // reload.
  let submissions: number | null = 0
  try {
    submissions = (await team.listSubmissions({ hackathonId })).submissions
      .length
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
