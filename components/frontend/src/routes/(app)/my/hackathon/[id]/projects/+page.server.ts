import type { PageServerLoad } from "./$types"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the
  // hackathon's projects.
  const { hackathon } = await event.parent()

  // Approved only. A proposal still awaiting an owner's decision is its
  // author's business, not something to browse — and this page has no way to
  // show the difference, since it carries no status badge.
  const approved = hackathon.projects.filter(
    (p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED,
  )

  // Newest first, matching how the page has always read.
  const ordered = [...approved].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )

  // `Project` carries only `creatorId`, so the name comes from the membership
  // list that arrived in the same response. A creator who has since left the
  // hackathon resolves to nothing and the card omits the line — better than
  // printing a raw uuid at someone.
  const memberNames = new Map(
    hackathon.members
      .filter((m) => m.user !== undefined)
      .map((m) => [m.user!.id, m.user!.displayName || m.user!.username]),
  )

  // TODO(backend: display-ordinals): `num` is a position in this list, not an
  // identifier. Project has no display number, so two viewers sorting the same
  // set agree, but the number a project shows changes as approvals land. Swap
  // in the real field once it exists.
  const projects = ordered.map((p, i) => ({
    id: p.id,
    num: ordered.length - i,
    title: p.title,
    description: p.description,
    creator: memberNames.get(p.creatorId),
    imageUrl: p.image,
  }))

  return { projects }
}
