import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayCreateSubmissions } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { submissionView } from "$lib/server/hackathon/submissionView"
import { teamOrError } from "$lib/server/hackathon/teams"

/**
 * One team's submission, read in full, with the team and the project it is
 * for. Keyed by the team, not the submission: every save is a new version with
 * a new id, so a link built from one would show a superseded entry after the
 * team's next save.
 *
 * Readable by whoever may see team assignments, the same rule as the team's
 * page and the Submissions list — all three read through `TeamService.Get`.
 * What it shows is built by `submissionView`, which Our submission shares.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const found = await teamOrError(team, event.params.teamId)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // The same rule the list's card uses to offer Edit on the viewer's own team.
  const maySubmit = mayCreateSubmissions(
    myMembership ?? undefined,
    enabledCapabilities(hackathon.state).includes(
      Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
    ),
    isAdmin,
  )

  return {
    hackathonId: hackathon.id,
    // From the team the backend returned rather than the URL, so no link
    // inherits a malformed id that `Get` would have refused.
    ...submissionView(hackathon, found, found.submissions),
    mayEdit: maySubmit && found.members.some((m) => m.id === platformUserId),
  }
}
