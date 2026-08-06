import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayPublishResults } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import {
  ballotSubmissions,
  categoryView,
  resultView,
  sortResults,
} from "$lib/server/hackathon/voting"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { vote, team } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayPublishResults(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can publish results")
  }

  let category
  try {
    const res = await vote.getVoteCategory({ id: event.params.categoryId })
    category = res.voteCategory
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Voting category not found")
    }
    throw e
  }
  if (!category) error(404, "Voting category not found")

  const submissions = await ballotSubmissions(
    team,
    event.params.id,
    new Map(hackathon.projects.map((p) => [p.id, p.title])),
  )
  const byId = new Map(
    submissions.map((s) => [
      s.id,
      { projectTitle: s.projectTitle, teamName: s.teamName },
    ]),
  )

  const [{ voteResults }, { votes }] = await Promise.all([
    vote.listVoteResults({ categoryId: event.params.categoryId }),
    vote.listVotes({
      hackathonId: event.params.id,
      categoryId: event.params.categoryId,
    }),
  ])

  return {
    hackathonId: hackathon.id,
    category: categoryView(category),
    results: sortResults(voteResults.map((r) => resultView(r, byId))),
    submissions,
    voteCount: votes.length,
    // Whether participants can already see what is on this page. Results are
    // publishable before this is on and readable after, so the screen says
    // which of the two states it is in rather than implying publishing and
    // showing are the same act.
    resultsVisible: enabledCapabilities(hackathon.state).includes(
      Capability.CAPABILITY_VIEW_RESULTS,
    ),
  }
}

export const actions: Actions = {
  // Tally the votes and write the placements. Separate from `add` because this
  // is the whole-category operation — it replaces every result at once.
  suggest: async (event) => {
    const { vote } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    // `force` deletes every existing result and recomputes
    // (`vote_service.go:1227`). Only ever sent from the confirm button, never
    // by default, so a first tally cannot silently overwrite a hand-edited one.
    const force = form.get("force") === "true"

    try {
      await vote.suggestResults({
        categoryId: event.params.categoryId,
        force,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
        // The backend refuses rather than clobbering, and its message carries
        // the count. Surfaced as a distinct flag so the page can offer the
        // overwrite rather than leaving the organizer stuck on an error.
        return fail(409, { needsForce: true, message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to publish results here",
        })
      }
      throw e
    }

    return { suggested: true }
  },

  add: async (event) => {
    const { vote } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const submissionId = form.get("submissionId")
    const position = Number(form.get("position"))
    const title = form.get("title")

    if (typeof submissionId !== "string" || submissionId.length === 0) {
      return fail(400, { message: "Pick a submission to place" })
    }
    if (!Number.isInteger(position) || position < 1) {
      return fail(400, {
        message: "Position must be a whole number of at least 1",
      })
    }

    try {
      await vote.createVoteResult({
        categoryId: event.params.categoryId,
        submissionId,
        position,
        title:
          typeof title === "string" && title.trim() ? title.trim() : undefined,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to publish results here",
        })
      }
      throw e
    }

    return { added: true }
  },

  edit: async (event) => {
    const { vote } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const id = form.get("resultId")
    const position = Number(form.get("position"))
    const title = form.get("title")

    if (typeof id !== "string" || id.length === 0) {
      return fail(400, { message: "No placement selected" })
    }
    if (!Number.isInteger(position) || position < 1) {
      return fail(400, {
        message: "Position must be a whole number of at least 1",
      })
    }

    try {
      await vote.editVoteResult({
        id,
        position,
        // Sent as "" rather than omitted when cleared: the field is `optional`,
        // so an absent one leaves the stored title alone and there would be no
        // way to remove a title once set.
        title: typeof title === "string" ? title.trim() : "",
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit results here",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "That placement no longer exists" })
      }
      throw e
    }

    return { edited: true }
  },

  remove: async (event) => {
    const { vote } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const id = form.get("resultId")
    if (typeof id !== "string" || id.length === 0) {
      return fail(400, { message: "No placement selected" })
    }

    try {
      await vote.deleteVoteResult({ id })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to remove results here",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "That placement no longer exists" })
      }
      throw e
    }

    return { removed: true }
  },
}
