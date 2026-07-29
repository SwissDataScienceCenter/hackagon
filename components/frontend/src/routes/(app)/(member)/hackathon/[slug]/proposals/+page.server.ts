import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  const proposals = hackathon.projects.map((p, i) => ({
    num: i + 1,
    id: p.id,
    title: p.title,
    description: p.description,
    imageUrl: p.image,
  }))

  return { proposals, slug: event.params.slug }
}
