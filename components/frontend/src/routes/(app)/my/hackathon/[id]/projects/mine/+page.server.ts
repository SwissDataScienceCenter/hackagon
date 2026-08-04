import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // project, at every status, each carrying `creatorId`. Same source the
  // Projects page reads — this one just filters differently.
  const { hackathon } = await event.parent()
  const myId = event.locals.platformUser?.id

  // Every status, unlike the Projects page: a proposal awaiting an organizer's
  // decision is exactly what its author came here to see.
  const mine = hackathon.projects.filter(
    (p) => myId !== undefined && p.creatorId === myId,
  )

  // Newest first, matching the Projects page.
  const ordered = [...mine].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )

  // Tracks arrive nested in the same response. A project whose track was
  // deleted resolves to nothing and the card omits the line.
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  // TODO(backend: display-ordinals): `num` is a position in this list, not an
  // identifier. Project has no display number, so the number a project shows
  // here differs from the one it shows on the Projects page — different list,
  // different position. Swap in the real field once it exists.
  const projects = ordered.map((p, i) => ({
    id: p.id,
    num: ordered.length - i,
    title: p.title,
    description: p.description,
    status: p.status,
    track: p.trackId ? trackNames.get(p.trackId) : undefined,
    imageUrl: p.image,
  }))

  // Unresolved on purpose: `resolve()` prepends `base`, and every consumer here
  // — the anchor in the page, `ProjectCard` for the edit link — calls it at the
  // link itself, as `svelte/no-navigation-without-resolve` requires. Resolving
  // here too would prefix `base` twice.
  return { projects, hackathonId: hackathon.id }
}
