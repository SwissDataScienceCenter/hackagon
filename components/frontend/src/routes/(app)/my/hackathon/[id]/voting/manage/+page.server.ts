import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageVoteCategories } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import type { Vote } from "$lib/server/grpc/generated/vote/entities/vote"
import {
  ballotSubmissions,
  categoryView,
  categoryVoterCount,
  resultView,
  roundIsFinal,
  sortResults,
  submissionLookup,
  tallyVotes,
  voterCount,
} from "$lib/server/hackathon/voting"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * The whole voting round on one page: the categories, the live count of every
 * one, and — once they are made — the final results of all of them.
 *
 * A round only moves forward: set up → voting open → voting closed → results
 * final → published. Opening and closing voting and publishing results are
 * switches in Settings; the one step taken here is making the results final,
 * once, for every category at the same time.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { vote, team } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageVoteCategories(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can manage voting")
  }

  const { voteCategories } = await vote.listVoteCategories({
    hackathonId: event.params.id,
  })

  // What every vote and result is *of*, so the count and the results can name
  // the project and team rather than a submission id.
  const byId = submissionLookup(
    await ballotSubmissions(
      team,
      event.params.id,
      new Map(hackathon.projects.map((p) => [p.id, p.title])),
    ),
  )

  // One call for the whole hackathon rather than one per category: ListVotes
  // filters by category but does not have to, and the owner holds `vote:read`
  // across the hackathon either way. Not degraded on failure: the votes decide
  // which categories are locked, and a lock that cannot be checked must not
  // read as "unlocked".
  const { votes } = await vote.listVotes({ hackathonId: event.params.id })
  const votesByCategory = votes.reduce((acc, v) => {
    acc.set(v.categoryId, [...(acc.get(v.categoryId) ?? []), v])
    return acc
  }, new Map<string, Vote[]>())

  // One call per category: ListVoteResults takes a category, not a hackathon.
  const resultsByCategory = new Map(
    await Promise.all(
      voteCategories.map(async (c) => {
        const { voteResults } = await vote.listVoteResults({ categoryId: c.id })
        return [c.id, voteResults] as const
      }),
    ),
  )

  const categories = voteCategories.map((c) => {
    const view = categoryView(c)
    const categoryVotes = votesByCategory.get(c.id) ?? []
    const tally = tallyVotes(view.method, categoryVotes, byId)
    const scoreOf = new Map(tally.map((t) => [t.submissionId, t.score]))
    const results = sortResults(
      (resultsByCategory.get(c.id) ?? []).map((r) => resultView(r, byId)),
    )

    return {
      ...view,
      voterCount: voterCount(categoryVotes),
      // The live count, shaped the way results are shown.
      count: tally.map((t) => ({
        key: t.submissionId,
        place: t.rank,
        projectTitle: t.projectTitle,
        teamName: t.teamName,
        teamId: t.teamId,
        score: t.score,
      })),
      // The stored places, with the score each came from. The backend keeps
      // only the place; the score is read back from the votes, which an
      // organizer may see.
      results: results.map((r) => ({
        key: r.id,
        place: r.position,
        projectTitle: r.projectTitle,
        teamName: r.teamName,
        teamId: r.teamId,
        score: scoreOf.get(r.submissionId),
        title: r.title,
      })),
    }
  })

  // See `roundIsFinal`. If making them final stopped partway, the round is not
  // final yet, and pressing the button again finishes the rest.
  const resultsFinal = roundIsFinal(
    categories.map((c) => ({
      voterCount: c.voterCount,
      resultCount: c.results.length,
    })),
  )

  const caps = enabledCapabilities(hackathon.state)

  return {
    hackathonId: hackathon.id,
    votingOpen: caps.includes(Capability.CAPABILITY_VOTE),
    resultsVisible: caps.includes(Capability.CAPABILITY_VIEW_RESULTS),
    voterTotal: voterCount(votes),
    resultsFinal,
    categories,
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

    // The list offers no Delete for a locked category; checked again here in
    // case someone voted after the page was rendered.
    if ((await categoryVoterCount(vote, event.params.id, id)) > 0) {
      return fail(409, {
        message:
          "People have voted in this category, so it can no longer be deleted.",
      })
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
      throw e
    }

    return { deleted: true }
  },

  // Make every category's results final, once. `SuggestResults` turns a
  // category's votes into stored places, and without `force` it refuses a
  // category that already has results (`vote_service.go:1257`) — so "once" is
  // the backend's own guarantee, not just a hidden button, and `force` is never
  // sent from anywhere. A category that already has results is skipped, which
  // is also what lets a press finish a run that stopped partway.
  finalize: async (event) => {
    const { vote, hackathon } = requireGrpc(event.locals.grpc)

    // Only once voting is closed, so nobody's vote can arrive after the results
    // are fixed. Read fresh: the page may be older than the switch in Settings.
    const { hackathon: h } = await hackathon.get({
      hackathonId: event.params.id,
    })
    if (enabledCapabilities(h?.state).includes(Capability.CAPABILITY_VOTE)) {
      return fail(409, {
        message: "Close voting in Settings first.",
        section: "finalize" as const,
      })
    }

    const { voteCategories } = await vote.listVoteCategories({
      hackathonId: event.params.id,
    })
    const { votes } = await vote.listVotes({ hackathonId: event.params.id })
    const withVotes = voteCategories.filter((c) =>
      votes.some((v) => v.categoryId === c.id),
    )

    // One by one rather than all at once, so a failure leaves a clear "these
    // are done" and a second press picks up exactly where this stopped.
    const failed: string[] = []
    for (const c of withVotes) {
      try {
        await vote.suggestResults({ categoryId: c.id, force: false })
      } catch (e) {
        if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
          continue // already final
        }
        if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
          return fail(403, {
            message: "You don't have permission to make results final here",
            section: "finalize" as const,
          })
        }
        event.locals.logger.error(
          { err: e, categoryId: c.id },
          "VOTING: making results final failed for a category",
        )
        failed.push(c.name)
      }
    }

    if (failed.length > 0) {
      return fail(502, {
        message: `Results could not be made final for ${failed.join(", ")}. Press the button again to finish.`,
        section: "finalize" as const,
      })
    }

    return { finalized: true }
  },
}
