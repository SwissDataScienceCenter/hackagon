import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// Prizes, and the awards that end up against them.
//
// The vote is advisory: an organiser reviews the tally and records who actually
// won, which is what Finalize freezes. That is a deliberate policy — a jury
// that cannot overrule its own count is not a jury — and it is why this screen
// exists rather than the results page simply publishing the leaderboard.

function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only this event's organisers can do that." })
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details })
    if (e.code === Status.FAILED_PRECONDITION)
      return fail(409, {
        message: e.details || "The awards are already finalised.",
      })
  }
  throw e
}

export const load: PageServerLoad = async (event) => {
  const { myMembership } = await event.parent()
  const { prize } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only this event's organisers can manage prizes")
  }

  // Prefilled, because Set replaces the whole table — see PrizeService.Get.
  const result = await prize.get({ hackathonId: event.params.id })

  return {
    prizes: result.prizes.map((p) => ({
      rank: p.rank,
      title: p.title,
      image: p.image ?? "",
    })),
    awards: result.awards.map((p) => ({ rank: p.rank, title: p.title })),
    finalized: result.finalized,
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { prize } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const ranks = form.getAll("rank")
    const titles = form.getAll("title")
    // Set replaces the table wholesale, so anything the form does not send back
    // is deleted. The image is not editable here yet, which makes carrying it
    // through mandatory rather than optional: without it, opening this page and
    // pressing Save silently strips every prize's picture.
    const images = form.getAll("image")
    const prizes: { rank: number; title: string; image?: string }[] = []
    for (let i = 0; i < titles.length; i++) {
      const title = String(titles[i] ?? "").trim()
      // An empty title is a row the organiser abandoned, not a nameless prize.
      if (!title) continue
      const image = String(images[i] ?? "").trim()
      prizes.push({
        rank: Number(ranks[i] ?? 0) || 0,
        title,
        ...(image ? { image } : {}),
      })
    }
    if (prizes.length === 0)
      return fail(400, { message: "Add at least one prize." })

    try {
      await prize.set({ hackathonId: event.params.id, prizes })
    } catch (e) {
      return formError(e)
    }

    return { saved: true }
  },

  finalize: async (event) => {
    const { prize } = requireGrpc(event.locals.grpc)

    try {
      await prize.finalize({ hackathonId: event.params.id })
    } catch (e) {
      return formError(e)
    }

    return { finalized: true }
  },
}
