import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { resolve } from "$app/paths"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayReviewProjects } from "$lib/server/hackathon/capabilities"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * The organiser's own way to put a project up, in the section their actions
 * live in.
 *
 * Gated on `mayReviewProjects` — the same gate as the rest of Manage Projects —
 * and *not* on `CAPABILITY_PROPOSE_PROJECTS`. That capability governs the
 * participant route (`projects/propose`); an `Owner` holds `project:propose`
 * outright as a default policy, so switching participant proposals off never
 * takes this away. It is the reason the participant page can drop its CTA
 * without leaving the hackathon with no create path.
 *
 * The RPC is the same `Propose`, so a project created here lands as `Proposed`
 * and waits in the queue below with everything else — the organiser approves it
 * in the same place they made it.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Frontend-only gate, same shape as the manage list beside it: `Propose`
  // enforces `project:propose` for real, this only decides whether the form
  // renders.
  if (!mayReviewProjects(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can add projects here")
  }

  return {
    hackathonId: hackathon.id,
    // Tracks arrive nested in the layout's `hackathon.get` — no RPC needed.
    tracks: hackathon.tracks.map((t) => ({ id: t.id, name: t.name })),
  }
}

export const actions: Actions = {
  // `save` rather than `create`: the action name is `ProjectEditForm`'s
  // contract, and this route reuses that form rather than growing a second one.
  save: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const title = form.get("title")
    const description = form.get("description")
    const trackId = form.get("trackId")
    const image = form.get("image")

    // The same rules the participant propose action applies — `Propose` is the
    // same RPC and accepts an empty description, whatever the shared form's
    // `required` attribute nudges towards.
    if (typeof title !== "string" || title.trim().length < 3) {
      return fail(400, { message: "Title must be at least 3 characters" })
    }
    if (title.trim().length > 255) {
      return fail(400, { message: "Title must be at most 255 characters" })
    }
    if (typeof description === "string" && description.length > 10000) {
      return fail(400, {
        message: "Description must be at most 10000 characters",
      })
    }

    try {
      await project.propose({
        hackathonId: event.params.id,
        title: title.trim(),
        description: typeof description === "string" ? description : "",
        // Whether the track belongs to this hackathon is the backend's call —
        // it checks, and says so. Sending nothing means "no track".
        trackId:
          typeof trackId === "string" && trackId !== "" ? trackId : undefined,
        image:
          typeof image === "string" && image.trim() !== ""
            ? image.trim()
            : undefined,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to add a project here",
        })
      }
      throw e
    }

    // Back to the queue, where the new project is the top row awaiting review.
    redirect(303, resolve(`/my/hackathon/${event.params.id}/projects/manage`))
  },
}
