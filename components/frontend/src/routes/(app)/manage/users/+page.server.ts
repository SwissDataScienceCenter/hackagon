import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { user } = requireGrpc(event.locals.grpc)

  // The sidebar only offers this page to a global admin, but the URL is
  // guessable and `UserService.List` requires user:read — which only admin
  // holds. Translate that denial rather than letting it surface as a 500.
  try {
    const result = await user.list({})
    return {
      users: result.users,
      // So the template can hide "revoke your own Admin role" — a courtesy,
      // not the real gate: `RemoveRole` blocks it server-side regardless.
      currentUserId: event.locals.platformUser?.id,
    }
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to view the user list")
    }
    throw e
  }
}

export const actions: Actions = {
  addRole: async (event) => {
    const { user } = requireGrpc(event.locals.grpc)
    const formData = await event.request.formData()
    const userId = formData.get("userId")
    const role = Number(formData.get("role"))

    if (typeof userId !== "string" || !userId) {
      return fail(400, { message: "Missing user" })
    }

    try {
      await user.addRole({ userId, role })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to assign roles",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "That user no longer exists" })
      }
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      throw e
    }

    return { assigned: true }
  },

  removeRole: async (event) => {
    const { user } = requireGrpc(event.locals.grpc)
    const formData = await event.request.formData()
    const userId = formData.get("userId")
    const role = Number(formData.get("role"))

    if (typeof userId !== "string" || !userId) {
      return fail(400, { message: "Missing user" })
    }

    try {
      await user.removeRole({ userId, role })
    } catch (e) {
      // Covers both a caller lacking user:write and the backend's own guard
      // against an admin removing their own Admin role — the latter should
      // be unreachable through this page since the button is hidden for
      // that case, but a direct resubmit still lands here.
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to remove roles",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "That user no longer exists" })
      }
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      throw e
    }

    return { removed: true }
  },
}
