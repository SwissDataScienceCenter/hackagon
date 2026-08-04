import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { user } = requireGrpc(event.locals.grpc)

  // The sidebar only offers this page to a global admin, but the URL is
  // guessable and `UserService.List` requires user:read — which only admin
  // holds. Translate that denial rather than letting it surface as a 500.
  try {
    const result = await user.list({})

    // Roles are deliberately absent from this table: List returns them empty.
    // `user_service.go` maps rows through `userEntryFromEnt` without the
    // `GetGlobalRoles` call that Get and WhoAmI make, so a role column would read
    // as roleless for everyone. The profile page shows real roles because Get
    // populates them.
    return { users: result.users }
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to view the user list")
    }
    throw e
  }
}
