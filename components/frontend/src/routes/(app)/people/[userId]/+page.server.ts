import type { PageServerLoad } from "./$types"
import { error, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import { requireGrpc } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  // Your own profile has its own route; landing here for yourself (from a
  // participants list, say) should not show a second, near-identical page.
  if (event.params.userId === event.locals.platformUser?.id) {
    redirect(307, "/profile")
  }

  const { user } = requireGrpc(event.locals.grpc)

  let target
  try {
    const result = await user.get({ userId: event.params.userId })
    target = result.user
  } catch (e) {
    if (e instanceof ClientError) {
      // UserService.Get requires `user:read`, which per rbac.go only the Admin
      // global role holds — there is no casbin policy row for the `user` object.
      // So this route is admin-only in practice, and the message says why rather
      // than reading as a bug.
      if (e.code === Status.PERMISSION_DENIED) {
        error(403, "You don't have permission to view this profile")
      }
      if (e.code === Status.NOT_FOUND) error(404, "User not found")
      // A userId that isn't a UUID is a bad URL, not a server fault.
      if (e.code === Status.INVALID_ARGUMENT) error(404, "User not found")
    }
    throw e
  }

  if (!target) error(404, "User not found")

  // Only real fields on `user.entities.User`. Get is the one read that populates
  // casbin roles, so unlike the admin users table this page can show them.
  return {
    profile: {
      id: target.id,
      username: target.username,
      displayName: target.displayName,
      email: target.email,
      roles: target.roles,
      createdAt: target.createdAt,
    },
  }
}
