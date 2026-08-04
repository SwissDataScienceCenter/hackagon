import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { projectStatusLabel } from "$lib/utils/projectStatus"

/** How many proposals the overview previews before linking to the full list. */
const PREVIEW_COUNT = 2

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  // Approved only, so this page's counts agree with what the proposals page
  // actually lists. Counting pending proposals here would make the two disagree.
  const approved = hackathon.projects.filter(
    (p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED,
  )

  const trackCounts = hackathon.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    count: approved.filter((p) => p.trackId === t.id).length,
  }))

  const newestFirst = [...approved].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )

  // Numbered the same way the proposals page numbers them, so a proposal shown
  // in both places carries the same number.
  const previewProposals = newestFirst
    .slice(0, PREVIEW_COUNT)
    .map((p, i) => ({
      id: p.id,
      num: newestFirst.length - i,
      title: p.title,
      description: p.description,
    }))

  const { teams } = await team.list({ hackathonId: event.params.id })

  // The first team the viewer is on. Nothing stops a participant from being on
  // more than one, but ParticipationCard has room for a single team — the
  // submissions page is where every team of theirs shows up.
  const myTeam = teams.find((t) =>
    t.members.some((m) => m.id === platformUserId),
  )

  const project = myTeam
    ? hackathon.projects.find((p) => p.id === myTeam.projectId)
    : undefined
  const track = project
    ? hackathon.tracks.find((t) => t.id === project.trackId)
    : undefined

  return {
    // Waitlisted members reach this page too — the badge should say so rather
    // than claim they are registered.
    membershipLabel: myMembership?.isWaiting ? "Waitlisted" : "Registered",
    myTeam: myTeam
      ? {
          id: myTeam.id,
          name: myTeam.name,
          memberCount: myTeam.members.length,
          // Team membership carries no role; creator is the one distinction the
          // schema makes, so that is what the card can honestly show.
          role: myTeam.creatorId === platformUserId ? "Creator" : "Member",
          projectName: project?.title ?? "Unknown project",
          projectTrack: track?.name ?? "No track",
          projectStatus: project
            ? (projectStatusLabel(project.status) ?? "Unknown")
            : "Unknown",
        }
      : null,
    approvedCount: approved.length,
    trackCounts,
    previewProposals,
  }
}
