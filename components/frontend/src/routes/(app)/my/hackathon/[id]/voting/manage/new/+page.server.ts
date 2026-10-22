import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { VoterType } from "$lib/server/grpc/generated/vote/entities/voter_type"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageVoteCategories } from "$lib/server/hackathon/capabilities"
import { methodFromSlug, votingRoundStatus } from "$lib/server/hackathon/voting"
import { readCategoryForm } from "$lib/server/hackathon/voteCategoryForm"
import { resolve } from "$app/paths"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageVoteCategories(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can add voting categories")
  }

  // Manage Voting stops offering "New category" once the results are final —
  // a category added then could never get any. This catches a direct link.
  const { final } = await votingRoundStatus(
    requireGrpc(event.locals.grpc).vote,
    event.params.id,
  )

  return { hackathonId: hackathon.id, resultsFinal: final }
}

export const actions: Actions = {
  save: async (event) => {
    const { vote } = requireGrpc(event.locals.grpc)
    const parsed = readCategoryForm(await event.request.formData())
    if ("message" in parsed) return fail(400, { message: parsed.message })

    if ((await votingRoundStatus(vote, event.params.id)).final) {
      return fail(409, {
        message: "The results are final, so no more categories can be added.",
      })
    }

    try {
      await vote.createVoteCategory({
        hackathonId: event.params.id,
        name: parsed.name,
        description: parsed.description,
        votingMethod: methodFromSlug(parsed.method)!,
        // Always all-participants: the platform offers no jury voting — a jury
        // prize is decided off the platform for now.
        voterType: VoterType.VOTER_TYPE_ALL_PARTICIPANTS,
        maxPoints: parsed.maxPoints,
        juryMemberIds: [],
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to add voting categories here",
        })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/voting/manage`))
  },
}
