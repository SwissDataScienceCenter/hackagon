import type { PageServerLoad } from "./$types"

const STATUS_LABELS: Partial<Record<number, string>> = {
  1: "Proposed",
  2: "Approved",
}

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  return {
    proposals: hackathon.projects.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      status: STATUS_LABELS[p.status] ?? "Unknown",
    })),
  }
}
