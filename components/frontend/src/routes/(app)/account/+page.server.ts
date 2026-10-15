import { fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import {
  editRequestFor,
  failForLinks,
  profileLinksFrom,
  profileLinksOf,
} from "$lib/server/user/profileLinks"

// No RPC of its own: `hooks.server.ts` already ran WhoAmI for this request and
// left the result on `locals.platformUser`, links included.
export const load: PageServerLoad = (event) => {
  const me = event.locals.platformUser
  // `null` rather than empty links when the backend was unreachable for
  // WhoAmI: empty would read as "you have set none" and invite the user to
  // retype links that are in fact saved.
  return { links: me ? profileLinksOf(me) : null }
}

export const actions: Actions = {
  // Always posts all three boxes, so an emptied box removes that link.
  links: async (event) => {
    const { user } = requireGrpc(event.locals.grpc)
    const values = profileLinksFrom(await event.request.formData())

    const me = event.locals.platformUser
    if (!me) {
      return fail(503, {
        message:
          "Hackagon could not be reached, so your links were not saved. Try again in a moment.",
        values,
      })
    }

    try {
      await user.edit(editRequestFor(me.id, values))
    } catch (e) {
      return failForLinks(e, values)
    }

    // Nothing to return but the outcome: the form's `update()` reruns the load,
    // whose WhoAmI brings back the links as the backend now renders them.
    return { saved: true }
  },
}
