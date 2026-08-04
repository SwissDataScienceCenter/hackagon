import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { resolve } from "$app/paths"
import {
  projectEditData,
  saveProjectEdit,
} from "$lib/server/hackathon/projectEdit"
import { redirect } from "@sveltejs/kit"

export const load: PageServerLoad = async (event) => {
  // Same source as the list and the project page: the layout's `hackathon.get`
  // already carries this project, so editing it needs no read of its own.
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

    // Back to the project, not to Proposals — this route is entered from the
    // project's own page and from the All Projects rows, and an approved project
    // is not on the Proposals list at all, so landing there would strand the
    // editor somewhere their project isn't.
    redirect(
      303,
      resolve(
        `/my/hackathon/${event.params.id}/projects/${event.params.projectId}`,
      ),
    )
  },
}
