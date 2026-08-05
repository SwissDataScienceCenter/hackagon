import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const isHackathonOwner =
    myMembership?.role === HackathonRole.HACKATHON_ROLE_OWNER
  // Same subjects the manage route's load gates on — shown here only to
  // decide whether to offer the link into it.
  const mayManageTeams = isHackathonOwner || isAdmin

  // Teams are the one collection `hackathon.get` does not nest, so this page
  // needs its own call. No error translation here: `TeamService.List` gates on
  // the same Hackathon/Read permission the layout's `hackathon.get` already
  // passed, so a denial at this point is a backend inconsistency and should
  // surface rather than be dressed up as a 403.
  const { teams } = await team.list({ hackathonId: event.params.id })

  const projectsById = new Map(hackathon.projects.map((p) => [p.id, p]))

  // Newest first, matching the projects page.
  const ordered = [...teams].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )

  const rows = ordered.map((t, i) => {
    const project = projectsById.get(t.projectId)

    return {
      id: t.id,
      // TODO(backend: display-ordinals): positional, not an identifier — Team
      // has no display number. See the same note on the projects page.
      num: ordered.length - i,
      title: t.name,
      // Which project the team is on is the useful line here; the team's own
      // description is the fallback for a team whose project went missing.
      projectDescription: project?.title ?? t.description ?? "",
      // TODO(backend: team-image): Team has no image of its own, so this is the
      // project's. A team without one falls back to the card's empty avatar —
      // the four /images/hackathon-ord-2024/* files this page used to cycle
      // through were decorative filler, unrelated to any team.
      imageUrl: project?.image,
      members: t.members.map((m) => ({ name: m.displayName || m.username })),
      isOwn: t.members.some((m) => m.id === platformUserId),
    }
  })

  return { teams: rows, hackathonId: event.params.id, mayManageTeams }
}
