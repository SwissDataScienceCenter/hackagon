import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const { teams } = await team.list({ hackathonId: event.params.id })

  // Every team the viewer is on, not just the first — nothing stops a
  // participant from being assigned to more than one team in one hackathon, and
  // each carries its own submissions.
  const myTeams = teams.filter((t) =>
    t.members.some((m) => m.id === platformUserId),
  )

  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  const groups = await Promise.all(
    myTeams.map(async (t) => {
      // ListSubmissions rather than the submissions nested in `team.list`: the
      // nested ones carry no ordering guarantee, and "which version counts"
      // depends entirely on order.
      const { submissions } = await team.listSubmissions({ teamId: t.id })

      const byVersion = [...submissions].sort((a, b) => a.version - b.version)
      const views = byVersion.map((s) => ({
        id: s.id,
        version: s.version,
        status: s.status,
        result: s.result,
        createdAt: s.createdAt,
        modifiedAt: s.modifiedAt,
      }))

      return {
        teamId: t.id,
        teamName: t.name,
        projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
        // Highest version is the one that counts; null when the team has none.
        latest: views.length > 0 ? views[views.length - 1]! : null,
        // Superseded versions, newest first.
        earlier: views.slice(0, -1).reverse(),
      }
    }),
  )

  return { groups }
}
