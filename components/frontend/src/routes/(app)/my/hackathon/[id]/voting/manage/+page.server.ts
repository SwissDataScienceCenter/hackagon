import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageVoteCategories } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { categoryView } from "$lib/server/hackathon/voting"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { vote } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageVoteCategories(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can manage voting")
  }

  const { voteCategories } = await vote.listVoteCategories({
    hackathonId: event.params.id,
  })

  // One call for the whole hackathon rather than one per category: ListVotes
  // filters by category but does not have to, and the owner holds `vote:read`
  // across the hackathon either way. Grouped here so each row can say whether
  // anyone has voted yet — which is the difference between a category that is
  // safe to change and one that is not.
  let voteCountByCategory = new Map<string, number>()
  try {
    const { votes } = await vote.listVotes({ hackathonId: event.params.id })
    voteCountByCategory = votes.reduce((acc, v) => {
      acc.set(v.categoryId, (acc.get(v.categoryId) ?? 0) + 1)
      return acc
    }, new Map<string, number>())
  } catch (e) {
    // Chrome, not content: the list is still worth rendering without the
    // counts, so a failure here degrades the rows rather than the page.
    event.locals.logger.warn(
      { err: e },
      "VOTING: vote count lookup failed, rendering categories without counts",
    )
  }

  return {
    hackathonId: hackathon.id,
    votingEnabled: enabledCapabilities(hackathon.state).includes(
      Capability.CAPABILITY_VOTE,
    ),
    categories: voteCategories.map((c) => ({
      ...categoryView(c),
      voteCount: voteCountByCategory.get(c.id) ?? 0,
    })),
  }
}

export const actions: Actions = {
  delete: async (event) => {
    const { vote } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const id = form.get("categoryId")
    if (typeof id !== "string" || id.length === 0) {
      return fail(400, { message: "No category selected" })
    }

    try {
      await vote.deleteVoteCategory({ id })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to delete voting categories here",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "That category no longer exists" })
      }
      // TODO(backend: vote-category-delete-cascade): DeleteVoteCategory does not
      // cascade to its votes, so once anyone has voted the delete fails on a
      // foreign key and surfaces as INTERNAL — indistinguishable from a real
      // server fault at this layer. Reproduced live: create a category, cast one
      // vote, delete → `constraint failed: ... violates foreign key constraint
      // "votes_vote_categories_votes"`. Until it cascades (or refuses with
      // FAILED_PRECONDITION), a category with votes reads as "something broke"
      // rather than "this is not allowed", so the row's delete button is
      // disabled once `voteCount > 0` and this branch explains the rest.
      if (e instanceof ClientError && e.code === Status.INTERNAL) {
        return fail(409, {
          message:
            "This category can't be deleted once votes have been cast. " +
            "Clear its votes first, or leave it in place.",
        })
      }
      throw e
    }

    return { deleted: true }
  },
}
