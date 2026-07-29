import type { LayoutServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"

export const load: LayoutServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const platformUser = event.locals.platformUser

  let result
  try {
    result = await hackathon.get({ hackathonId: event.params.slug })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You are not a member of this hackathon")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Hackathon not found")
    }
    throw e
  }

  if (!result.hackathon) {
    error(404, "Hackathon not found")
  }

  const myMembership =
    result.hackathon.members.find((m) => m.user?.id === platformUser?.id) ??
    null
  const isGlobalAdmin =
    platformUser?.roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN) ?? false

  // UI-only gate for the admin shell. The real security boundary is casbin's
  // Write permission (Owner-only) enforced on each mutating RPC these pages call.
  if (
    myMembership?.role !== HackathonRole.HACKATHON_ROLE_OWNER &&
    !isGlobalAdmin
  ) {
    error(403, "You must be an owner of this hackathon to access admin tools")
  }

  return { hackathon: result.hackathon, myMembership }
}
