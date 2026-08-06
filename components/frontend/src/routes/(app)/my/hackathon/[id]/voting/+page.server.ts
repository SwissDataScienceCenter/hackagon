import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayVote } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { ballotSubmissions, categoryView } from "$lib/server/hackathon/voting"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { vote, team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const votingEnabled = enabledCapabilities(hackathon.state).includes(
    Capability.CAPABILITY_VOTE,
  )
  const canVote = mayVote(myMembership ?? undefined, votingEnabled, isAdmin)

  // Not a 403. Voting being closed is a normal state of a hackathon, not a
  // permission problem the viewer got wrong, and the nav can link here before
  // and after it opens. The page says so and offers nothing.
  if (!canVote) {
    return {
      hackathonId: hackathon.id,
      votingEnabled,
      canVote: false,
      categories: [],
      submissions: [],
      myVotes: {},
    }
  }

  const { voteCategories } = await vote.listVoteCategories({
    hackathonId: event.params.id,
  })

  const submissions = await ballotSubmissions(
    team,
    event.params.id,
    new Map(hackathon.projects.map((p) => [p.id, p.title])),
    platformUserId,
  )

  // Only what this viewer may actually cast. A jury category refuses anyone off
  // its roster, and a ranked category has no control in the booth — both are
  // filtered rather than shown-and-refused. `juryMemberIds` holds platform user
  // ids, the same ids `platformUser.id` and the team rosters use.
  const categories = voteCategories
    .map(categoryView)
    .filter((c) => c.votableInBooth)
    .filter(
      (c) =>
        !c.isJury ||
        (platformUserId !== undefined &&
          c.juryMemberIds.includes(platformUserId)),
    )

  // The viewer's own votes, so the booth opens showing what they already chose
  // rather than a blank ballot. Scoped by voterId because ListVotes only lets a
  // caller read *someone else's* votes with hackathon-wide `vote:read`, which a
  // participant does not have — passing their own id is what makes this
  // readable to them at all (`vote_service.go:781`).
  const myVotes: Record<string, Record<string, number>> = {}
  if (platformUserId) {
    try {
      const { votes } = await vote.listVotes({
        hackathonId: event.params.id,
        voterId: platformUserId,
      })
      for (const v of votes) {
        // ts-proto renders the `vote` oneof as three flat optional fields
        // rather than a discriminated union, so which one is set *is* the
        // discriminator. Each carries exactly one submission — the request side
        // batches, the stored vote does not.
        const submissionId =
          v.singleChoice?.submissionId ??
          v.points?.submissionId ??
          v.ranked?.submissionId
        if (!submissionId) continue

        const forCategory = (myVotes[v.categoryId] ??= {})
        // Single choice carries no value; 1 marks "chosen" so both methods can
        // share one shape and the page reads points and selection the same way.
        forCategory[submissionId] = v.points?.points ?? 1
      }
    } catch (e) {
      event.locals.logger.warn(
        { err: e },
        "VOTING: own-vote lookup failed, opening the ballot blank",
      )
    }
  }

  return {
    hackathonId: hackathon.id,
    votingEnabled,
    canVote: true,
    categories,
    submissions,
    myVotes,
  }
}

export const actions: Actions = {
  vote: async (event) => {
    const { vote } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const categoryId = form.get("categoryId")
    const method = form.get("method")
    if (typeof categoryId !== "string" || categoryId.length === 0) {
      return fail(400, { message: "No category selected" })
    }

    try {
      if (method === "single_choice") {
        const submissionId = form.get("submissionId")
        if (typeof submissionId !== "string" || submissionId.length === 0) {
          return fail(400, { message: "Pick a submission to vote for" })
        }
        await vote.submitVote({ categoryId, singleChoice: { submissionId } })
      } else if (method === "points") {
        // Zero-point entries are dropped rather than sent: the field is
        // constrained `gt = 0`, so a submission left blank would fail
        // validation for the whole ballot instead of simply not being voted
        // for.
        const submissions = form
          .getAll("submissionId")
          .filter((id): id is string => typeof id === "string")
          .map((id) => ({
            submissionId: id,
            points: Number(form.get(`points:${id}`)),
          }))
          .filter((s) => Number.isInteger(s.points) && s.points > 0)

        if (submissions.length === 0) {
          return fail(400, {
            message: "Give at least one submission some points",
          })
        }
        await vote.submitVote({ categoryId, points: { submissions } })
      } else {
        return fail(400, { message: "Unsupported voting method" })
      }
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        // The handler uses PermissionDenied for two very different things —
        // "voting is not open to you" and "that one is your own team's" — and
        // its message is the only way to tell them apart. Passed through rather
        // than replaced with a generic line, because the specific one is the
        // useful one.
        return fail(403, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "That category no longer exists" })
      }
      throw e
    }

    return { voted: true, categoryId }
  },
}
