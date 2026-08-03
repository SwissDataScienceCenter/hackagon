import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { projectStatusLabel } from "$lib/utils/projectStatus"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser!.id

  // Count approved only, mirroring the Projects page — counting pending
  // proposals here would disagree with the list that page actually shows.
  const approved = hackathon.projects.filter(
    (p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED,
  )
  const trackCounts = hackathon.tracks.map((t) => ({
    name: t.name,
    count: approved.filter((p) => p.trackId === t.id).length,
  }))

  const result = await team.list({ hackathonId: event.params.slug })
  const myTeam = result.teams.find((t) => t.members.some((m) => m.id === platformUserId))

  if (!myTeam) {
    return { myTeam: null, approvedCount: approved.length, trackCounts }
  }

  const project = hackathon.projects.find((p) => p.id === myTeam.projectId)
  const track = project ? hackathon.tracks.find((t) => t.id === project.trackId) : undefined

  // A separate call because TeamService.List does not eager-load submissions —
  // `myTeam.submissions` is always empty there. Swallowed rather than fatal: the
  // rest of the card is still worth showing if this one read fails, and an
  // absent status degrades to "Not started", which is what it looked like
  // before submissions appeared here at all.
  let submissionStatus: number | undefined
  try {
    const { submissions } = await team.listSubmissions({ teamId: myTeam.id })
    // Ordered by version ascending, so the last is the team's current one.
    submissionStatus = submissions.at(-1)?.status
  } catch {
    submissionStatus = undefined
  }

  return {
    myTeam: {
      id: myTeam.id,
      name: myTeam.name,
      memberCount: myTeam.members.length,
      projectName: project?.title ?? "Unknown project",
      projectTrack: track?.name ?? "No track",
      projectStatus: project ? (projectStatusLabel(project.status) ?? "Unknown") : "Unknown",
      submissionStatus,
    },
    approvedCount: approved.length,
    trackCounts,
  }
}
