import type { LayoutServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"

export const load: LayoutServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser!.id

  const { hackathons: myHackathons } = await hackathon.list({ participantId })

  return {
    myHackathons,
    isGlobalAdmin:
      event.locals.platformUser?.roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN) ??
      false,
  }
}
