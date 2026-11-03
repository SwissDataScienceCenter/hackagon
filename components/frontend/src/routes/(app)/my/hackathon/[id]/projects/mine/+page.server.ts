import type { PageServerLoad } from "./$types"
import { myProjects } from "$lib/server/hackathon/myProjects"
import { markdownExcerpt } from "$lib/utils/markdown"
import { PROJECT_EXCERPT_CHARS } from "$lib/utils/projectExcerpt"

// Every project the viewer proposed here, at every status — the page behind the
// sidebar's My projects entry. Both read `myProjects`, so a viewer who is not
// taking part gets an empty page here rather than a 404, the same as one who
// has proposed nothing.
export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // project at every status, plus the tracks that name them.
  const { hackathon } = await event.parent()

  const mine = myProjects(hackathon, event.locals.platformUser?.id)
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  // No `creator`: every row is the viewer's own, and their name on each would
  // say nothing.
  const projects = mine.map((p, i) => ({
    id: p.id,
    num: mine.length - i,
    title: p.title,
    excerpt: markdownExcerpt(p.description, PROJECT_EXCERPT_CHARS),
    track: p.trackId ? trackNames.get(p.trackId) : undefined,
    imageUrl: p.image,
    status: p.status,
  }))

  return {
    projects,
    hackathonId: hackathon.id,
  }
}
