import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageVoteCategories } from "$lib/server/hackathon/capabilities"
import { categoryView, methodFromSlug } from "$lib/server/hackathon/voting"
import { readCategoryForm } from "$lib/server/hackathon/voteCategoryForm"
import { resolve } from "$app/paths"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { vote } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageVoteCategories(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can edit voting categories")
  }

  // GetVoteCategory rather than filtering the list, same reason the phase and
  // track edit forms re-read their single entity: the form must reflect what is
  // stored now, not what the manage list held when it was rendered.
  let category
  try {
    const res = await vote.getVoteCategory({ id: event.params.categoryId })
    category = res.voteCategory
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Voting category not found")
    }
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to view this voting category")
    }
    throw e
  }
  if (!category) error(404, "Voting category not found")

  // Only to warn with. EditVoteCategory *deletes every vote in the category*
  // when the voting method changes (`applyVotingMethodChange`,
  // `vote_service.go:524`) — silently, with no confirmation and nothing in the
  // response to say it happened. An organizer switching Single choice to Points
  // to see what it looks like would throw away every vote already cast, so the
  // form says so before they do it.
  let voteCount = 0
  try {
    const { votes } = await vote.listVotes({
      hackathonId: event.params.id,
      categoryId: event.params.categoryId,
    })
    voteCount = votes.length
  } catch (e) {
    event.locals.logger.warn(
      { err: e },
      "VOTING: vote count lookup failed, editing without the vote-loss warning",
    )
  }

  return {
    hackathonId: hackathon.id,
    category: categoryView(category),
    voteCount,
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { vote } = requireGrpc(event.locals.grpc)
    const parsed = readCategoryForm(await event.request.formData())
    if ("message" in parsed) return fail(400, { message: parsed.message })

    try {
      await vote.editVoteCategory({
        id: event.params.categoryId,
        name: parsed.name,
        description: parsed.description,
        votingMethod: methodFromSlug(parsed.method)!,
        // `voterType` is omitted so an existing jury category is not silently
        // demoted to all-participants by a form that has no control for it.
        //
        // `juryMemberIds` is sent empty, which is *not* the same as clearing it:
        // the field is `repeated`, so an empty list encodes to no bytes at all
        // and the handler's `req.JuryMemberIds != nil` check
        // (`vote_service.go:545`) sees an absent field and leaves the roster
        // alone. Clearing a jury would need a control that can express it.
        maxPoints: parsed.maxPoints,
        juryMemberIds: [],
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit voting categories here",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "That category no longer exists" })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/voting/manage`))
  },
}
