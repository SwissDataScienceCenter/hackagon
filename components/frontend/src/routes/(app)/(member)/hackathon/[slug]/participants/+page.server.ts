import type { PageServerLoad } from "./$types"
import { membershipBadgeLabel } from "$lib/utils/hackathonStatus"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  const participants = hackathon.members
    .filter((m) => m.user !== undefined)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
      roleLabel: membershipBadgeLabel(m.isWaiting, m.role),
    }))

  return { participants }
}
