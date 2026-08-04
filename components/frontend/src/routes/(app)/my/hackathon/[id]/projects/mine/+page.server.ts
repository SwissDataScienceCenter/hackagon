import type { PageServerLoad } from "./$types"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // project, at every status, each carrying `creatorId`. Same source the All
  // Projects page reads — this one just filters differently.
  const { hackathon } = await event.parent()
  const myId = event.locals.platformUser?.id

  const authored = hackathon.projects.filter(
    (p) => myId !== undefined && p.creatorId === myId,
  )

  // Proposals awaiting a decision only. Once a proposal is approved it stops
  // being a proposal and becomes one of the hackathon's projects, where All
  // Projects is the page that lists it — so it leaves this one.
  const pending = authored.filter(
    (p) => p.status === ProjectStatus.PROJECT_STATUS_PROPOSED,
  )

  // Newest first, matching the All Projects page.
  const ordered = [...pending].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )

  // Tracks arrive nested in the same response. A project whose track was
  // deleted resolves to nothing and the card omits the line.
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  // TODO(backend: display-ordinals): `num` is a position in this list, not an
  // identifier. Project has no display number, so the number a project shows
  // here differs from the one it shows on the All Projects page — different
  // list, different position. Swap in the real field once it exists.
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
  return {
    projects,
    hackathonId: hackathon.id,
    // So the empty state can tell "you have never proposed anything" apart from
    // "everything you proposed was approved and has moved on". Without it the
    // page tells the second author they have not proposed a project.
    approvedCount: authored.length - pending.length,
  }
}
