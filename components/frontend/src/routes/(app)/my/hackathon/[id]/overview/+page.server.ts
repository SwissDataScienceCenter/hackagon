import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { listVisibleTeams } from "$lib/server/hackathon/teams"
import { projectStatusLabel } from "$lib/utils/projectStatus"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership, hackathonState } = await event.parent()
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

  // `listVisibleTeams` rather than `team.list` directly. `TeamService.List`
  // requires `team:read`, and a member holds that only while
  // `CAPABILITY_VIEW_TEAMS` is switched on — off in every hackathon until an
  // organiser publishes assignments, which is the steady state of a newly
  // created one. An owner holds the grant unconditionally, so the bare call
  // here only ever failed for members, and it turned that refusal into a 500 on
  // the first page a member lands on.
  //
  // `undefined` (not published) is kept distinct from `[]` (published, nobody
  // assigned): the card must not tell someone they are on no team when it has
  // simply not been told.
  const visibleTeams = await listVisibleTeams(team, event.params.id)
  const teams = visibleTeams ?? []

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

  // Whether the submission nudge on the participation card is an action or a
  // statement of fact. The card must not offer a button into a capability that is
  // switched off: `CreateSubmission` would refuse it.
  const canSubmit = hackathonState.enabled.includes(
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
          // Null for an approved project, and the card then omits the line:
          // `projectStatusLabel` only names a status worth showing, and a team
          // whose project is approved has nothing to be told. Null rather than
          // "Unknown" — the old fallback now that approved has no label —
          // because that would have read as a data problem.
          projectStatus: project
            ? (projectStatusLabel(project.status) ?? null)
            : null,
          submissionCount: myTeam.submissions.length,
        }
      : null,
    // Whether `myTeam: null` means "not on a team" or "assignments are not
    // published". The card says something different for each; only the first is
    // a statement about this person.
    teamsVisible: visibleTeams !== undefined,
    canSubmit,
    approvedCount: approved.length,
    trackCounts,
  }
}
