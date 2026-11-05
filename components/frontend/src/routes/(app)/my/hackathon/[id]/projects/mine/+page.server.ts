import type { PageServerLoad } from "./$types"
import { namesByUserId } from "$lib/server/hackathon/membership"
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
  const { hackathon, proposalsOpen } = await event.parent()

  const mine = myProjects(hackathon, event.locals.platformUser?.id)
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))
  const names = namesByUserId(hackathon.members, hackathon.owners)

  // `creator` although every row is the viewer's own: a project card reads the
  // same on every list, and this one is no exception.
  const projects = mine.map((p) => ({
    id: p.id,
    title: p.title,
    excerpt: markdownExcerpt(p.description, PROJECT_EXCERPT_CHARS),
    creator: names.get(p.creatorId),
    track: p.trackId ? trackNames.get(p.trackId) : undefined,
    imageUrl: p.image,
    status: p.status,
  }))

  return {
    projects,
    hackathonId: hackathon.id,
    // Whether to offer the Propose button. Decided once in the layout, so the
    // button and the sidebar entry that leads here agree.
    proposalsOpen,
  }
}
