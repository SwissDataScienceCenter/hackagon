import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The account page: what the platform knows about you, and how to leave.
//
// DeleteAccount is self-service by design — it takes no user id, so this page
// can only ever delete the caller's own profile.

export const load: PageServerLoad = async (event) => {
  return { user: event.locals.platformUser ?? null }
}

export const actions: Actions = {
  delete: async (event) => {
    const { user } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    // Typing the username is the confirmation: this removes the profile and
    // every role, and nothing here can undo it.
    const typed = String(form.get("confirm") ?? "").trim()
    const expected = event.locals.platformUser?.username ?? ""
    if (!expected || typed !== expected) {
      return fail(400, {
        message: `Type your username (${expected}) exactly to confirm.`,
      })
    }

    try {
      await user.deleteAccount({})
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
        // Authored content is Restrict-guarded: the backend refuses rather
        // than cascading away pages or submissions other people rely on.
        return fail(409, {
          message:
            e.details ||
            "Your profile still owns content an organizer must reassign or remove first.",
        })
      }
      throw e
    }

    // The Keycloak identity survives deletion, so sign out to clear the
    // session rather than leaving a token for a profile that no longer exists.
    redirect(303, "/signout")
  },
}
