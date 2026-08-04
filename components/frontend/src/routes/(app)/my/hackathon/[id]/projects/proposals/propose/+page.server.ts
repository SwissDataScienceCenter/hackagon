import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { resolve } from "$app/paths"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  // The only case the layout lets through that cannot propose. Everyone else
  // who gets this far — confirmed member, hackathon owner, global admin — holds
  // a casbin role that grants `project:propose`, so there is nothing further
  // for the frontend to decide. `Propose` itself stays authoritative below.
  if (myMembership?.isWaiting) {
    error(403, "Your membership is still awaiting approval")
  }

  return {
    hackathonId: hackathon.id,
    // Tracks arrive nested in the layout's `hackathon.get` — no RPC needed.
    tracks: hackathon.tracks.map((t) => ({ id: t.id, name: t.name })),
  }
}

export const actions: Actions = {
  propose: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const title = form.get("title")
    const description = form.get("description")
    const trackId = form.get("trackId")
    const image = form.get("image")

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
        // Propose accepts an empty description; only Edit insists on one.
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
          message: "You don't have permission to propose a project here",
        })
      }
      throw e
    }

    // Proposals rather than All Projects: the new project is `Proposed`, and the
    // Projects page shows approved ones only — landing there would look like
    // the proposal vanished.
    redirect(
      303,
      resolve(`/my/hackathon/${event.params.id}/projects/proposals`),
    )
  },
}
