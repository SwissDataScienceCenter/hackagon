import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  const phases = [...hackathon.phases].sort((a, b) => {
    const ta = a.startsAt ? new Date(a.startsAt).getTime() : 0
    const tb = b.startsAt ? new Date(b.startsAt).getTime() : 0

    return ta - tb
  })

  return {
    phases: phases.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      startsAt: p.startsAt ?? null,
      endsAt: p.endsAt ?? null,
    })),
  }
}
