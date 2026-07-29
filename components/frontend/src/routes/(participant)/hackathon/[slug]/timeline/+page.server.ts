import type { PageServerLoad } from "./$types"
import { phaseStatus } from "$lib/utils/phase"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  const phases = [...hackathon.phases]
    .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      status: phaseStatus(p.startsAt, p.endsAt),
    }))

  return { phases }
}
