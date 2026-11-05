import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayCreateSubmissions } from "$lib/server/hackathon/capabilities"
import { namesByUserId } from "$lib/server/hackathon/membership"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { submissionEntry } from "$lib/server/hackathon/submissions"
import { teamOrError } from "$lib/server/hackathon/teams"
import { markdownExcerpt } from "$lib/utils/markdown"
import { PROJECT_EXCERPT_CHARS } from "$lib/utils/projectExcerpt"

/**
 * One team's submission, read in full, with the team and the project it is
 * for. Keyed by the team, not the submission: every save is a new version with
 * a new id, so a link built from one would show a superseded entry after the
 * team's next save.
 *
 * Readable by whoever may see team assignments, the same rule as the team's
 * page and the Submissions list — all three read through `TeamService.Get`.
 * `Get` eager-loads drafts too (see `TODO(backend: submission-cross-team-read)`
 * in `teamEntries`); `submissionEntry` keeps the final one, and only its fields
 * leave the server.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const found = await teamOrError(team, event.params.teamId)

  // Not checked against this hackathon's projects on purpose — see the team
  // page's load: that list is filtered to what the viewer may see.
  const project = hackathon.projects.find((p) => p.id === found.projectId)

  // Who saved the entry, and who proposed the project — members and owners, so
  // an organiser who proposed without joining is named too.
  const names = namesByUserId(hackathon.members, hackathon.owners)
  const entry = submissionEntry(found.submissions, names)
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // The same rule the list's card uses to offer Edit on the viewer's own team.
  const maySubmit = mayCreateSubmissions(
    myMembership ?? undefined,
    enabledCapabilities(hackathon.state).includes(
      Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
    ),
    isAdmin,
  )

  return {
    hackathonId: hackathon.id,
    ...backTo(hackathon.id, found.id, event.url.searchParams.get("from")),
    // From the team the backend returned rather than the URL, so no link
    // inherits a malformed id that `Get` would have refused.
    teamId: found.id,
    teamName: found.name,
    projectTitle: project?.title ?? "Unknown project",
    // TODO(backend: team-image): Team has no image of its own, so the
    // project's is the only one there is.
    imageUrl: project?.image,
    // The id is the participant profile's: `participants/<userId>`.
    members: found.members.map((m) => ({
      id: m.id,
      name: m.displayName || m.username,
    })),
    // The project as the projects list draws it — the team page's rule:
    // approved only, since `projects/<id>` answers 403 for a proposed project
    // unless the viewer proposed it.
    project:
      project?.status === ProjectStatus.PROJECT_STATUS_APPROVED
        ? {
            id: project.id,
            excerpt: markdownExcerpt(
              project.description,
              PROJECT_EXCERPT_CHARS,
            ),
            creator: names.get(project.creatorId),
            track: project.trackId
              ? trackNames.get(project.trackId)
              : undefined,
            imageUrl: project.image,
          }
        : undefined,
    // Field by field rather than the whole entry: only what the page shows
    // leaves the server.
    entry: entry
      ? {
          repositoryUrl: entry.repositoryUrl,
          attachmentFolderUrl: entry.attachmentFolderUrl,
          description: entry.description,
          updatedAt: entry.updatedAt,
          updatedBy: entry.updatedBy,
        }
      : null,
    mayEdit: maySubmit && found.members.some((m) => m.id === platformUserId),
  }
}

/**
 * Where "back" goes: to the page that sent the reader here, named by `?from=`,
 * and the Submissions list when there is none or it is one this does not know.
 * Only ever builds a path of our own, so an unknown value cannot send anyone
 * elsewhere.
 */
function backTo(
  hackathonId: string,
  teamId: string,
  from: string | null,
): { backHref: string; backLabel: string } {
  const base = `/my/hackathon/${hackathonId}`
  switch (from) {
    case "voting":
      return { backHref: `${base}/voting`, backLabel: "Back to voting" }
    case "results":
      return { backHref: `${base}/results`, backLabel: "Back to results" }
    case "manage-voting":
      return {
        backHref: `${base}/voting/manage`,
        backLabel: "Back to manage voting",
      }
    case "team":
      return {
        backHref: `${base}/teams/${teamId}`,
        backLabel: "Back to the team",
      }
    default:
      return {
        backHref: `${base}/submissions`,
        backLabel: "Back to submissions",
      }
  }
}
