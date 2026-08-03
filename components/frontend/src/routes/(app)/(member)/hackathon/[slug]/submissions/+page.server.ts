import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import type { Submission } from "$lib/server/grpc/generated/hackathon/entities/submission"

interface SubmissionView {
  id: string
  version: number
  status: number
  result?: string
  createdAt: Date | undefined
  modifiedAt: Date | undefined
}

interface TeamSubmissions {
  teamId: string
  teamName: string
  projectTitle: string
  /** Highest version — the one that counts. Null when the team has none yet. */
  latest: SubmissionView | null
  /** Superseded versions, newest first. */
  earlier: SubmissionView[]
}

const toView = (s: Submission): SubmissionView => ({
  id: s.id,
  version: s.version,
  status: s.status,
  result: s.result,
  createdAt: s.createdAt,
  modifiedAt: s.modifiedAt,
})

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const { teams } = await team.list({ hackathonId: event.params.slug })

  // Every team the viewer is on, not just the first match — nothing stops a
  // participant from being assigned to more than one team in one hackathon.
  const myTeams = teams.filter((t) =>
    t.members.some((m) => m.id === platformUserId),
  )

  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  const groups: TeamSubmissions[] = await Promise.all(
    myTeams.map(async (t) => {
      // ListSubmissions orders by version ascending and returns [] for a team
      // with none. GetSubmission would 404 instead, and team.get's nested
      // submissions carry no ordering guarantee.
      const { submissions } = await team.listSubmissions({ teamId: t.id })
      const views = submissions.map(toView)

      return {
        teamId: t.id,
        teamName: t.name,
        projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
        latest: views.length > 0 ? views[views.length - 1]! : null,
        earlier: views.slice(0, -1).reverse(),
      }
    }),
  )

  return { slug: event.params.slug, groups }
}
