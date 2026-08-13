import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { currentAndNextPhase } from "$lib/utils/phase"
import { projectStatusLabel } from "$lib/utils/projectStatus"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership, isGlobalAdmin } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  // Approved only, so this page's counts agree with what the projects page
  // actually lists. Counting pending proposals here would make the two disagree,
  // and a proposal waiting is an organiser's business — Manage Hackathon badges
  // that count onto the tile that clears it.
  const approved = hackathon.projects.filter(
    (p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED,
  )

  const trackCounts = hackathon.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    count: approved.filter((p) => p.trackId === t.id).length,
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

  const enabled = enabledCapabilities(hackathon.capabilities)

  // Empty string rather than undefined when nothing is declared, which
  // `currentAndNextPhase` reads as "fall back to the dates" — the same
  // precedence `resolvePhaseStatus` applies on the timeline, so the two surfaces
  // cannot name different phases as the live one. Same rule Manage Hackathon
  // applies (`manage/+page.server.ts`).
  const currentPhaseId = hackathon.currentPhaseId ?? ""
  const { current, next, declared } = currentAndNextPhase(
    hackathon.phases,
    currentPhaseId || undefined,
  )

  // Whether the submission nudge on the participation card is an action or a
  // statement of fact. The card must not offer a button into a capability that is
  // switched off: `CreateSubmission` would refuse it.
  const canSubmit = enabled.includes(
    Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
  )

  return {
    // Waitlisted members reach this page too — the badge should say so rather
    // than claim they are registered. The flag travels alongside the label so
    // the badge colour keys off it rather than string-matching the label.
    membershipLabel: myMembership?.isWaiting ? "Waitlisted" : "Registered",
    membershipIsWaiting: myMembership?.isWaiting ?? false,
    myTeam: myTeam
      ? {
          id: myTeam.id,
          name: myTeam.name,
          // Names rather than a count: the card draws initials from them, and
          // `Team.members` are full `User`s so there is nothing to look up. Falls
          // back to the username, the precedence used everywhere else.
          memberNames: myTeam.members.map(
            (m) => m.displayName || m.username || "Unknown",
          ),
          // Team membership carries no role; creator is the one distinction the
          // schema makes, so that is what the card can honestly show.
          role: myTeam.creatorId === platformUserId ? "Creator" : "Member",
          projectName: project?.title ?? "Unknown project",
          projectTrack: track?.name ?? "No track",
          projectStatus: project
            ? (projectStatusLabel(project.status) ?? "Unknown")
            : "Unknown",
          submissionCount: myTeam.submissions.length,
        }
      : null,
    canSubmit,
    approvedCount: approved.length,
    trackCounts,

    // CurrentStateCard's contract. Deliberately NOT reduced to `enabled:
    // number[]` the way main's `hackathonState` carries it — that would
    // collapse UNGOVERNED back into "closed" and drop COMING's date. Passed
    // through exactly as `Hackathon.capabilities` arrives, same as
    // `CapabilitiesPanel` takes it. See `manage/+page.server.ts` for why this
    // branch has no subtree-wide `hackathonState` on the layout.
    capabilities: hackathon.capabilities,
    organiserVoice: mayManagePhases(myMembership ?? undefined, isGlobalAdmin),
    declared,
    currentPhase: current
      ? {
          name: current.name,
          description: current.description ?? "",
          startsAt: current.startsAt,
          endsAt: current.endsAt,
        }
      : null,
    nextPhase: next
      ? { name: next.name, startsAt: next.startsAt, endsAt: next.endsAt }
      : null,
  }
}
