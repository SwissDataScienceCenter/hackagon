import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { resolve } from "$app/paths"
import {
  projectEditData,
  saveProjectEdit,
} from "$lib/server/hackathon/projectEdit"
import { redirect } from "@sveltejs/kit"

export const load: PageServerLoad = async (event) => {
  // Same source as the list: the layout's `hackathon.get` already carries this
  // project, so editing it needs no read of its own.
  const { hackathon, myMembership } = await event.parent()

  return projectEditData(
    hackathon,
    event.params.projectId,
    myMembership,
    event.locals.platformUser,
  )
}

export const actions: Actions = {
  save: async (event) => {
    const grpc = requireGrpc(event.locals.grpc)

    const failure = await saveProjectEdit(
      grpc,
      event.params.projectId,
      await event.request.formData(),
    )
    if (failure) return failure

    // Back to Proposals, which is where this route is entered from. A proposal
    // that was edited is still awaiting review, so it is still on that list.
    redirect(
      303,
      resolve(`/my/hackathon/${event.params.id}/projects/proposals`),
    )
  },
}
