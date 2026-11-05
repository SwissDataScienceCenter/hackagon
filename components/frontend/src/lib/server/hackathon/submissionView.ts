import type { Hackathon } from "$lib/server/grpc/generated/hackathon/entities/hackathon"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import type { Submission } from "$lib/server/grpc/generated/hackathon/entities/submission"
import type { Team } from "$lib/server/grpc/generated/hackathon/entities/team"
import { markdownExcerpt } from "$lib/utils/markdown"
import { PROJECT_EXCERPT_CHARS } from "$lib/utils/projectExcerpt"
import { namesByUserId } from "./membership"
import { submissionEntry } from "./submissions"

/**
 * One team's submission as `SubmissionDetail` draws it: the entry, the team
 * and the project. Shared by the submission's page and Our submission, so a
 * team reads its own entry exactly as everyone else does.
 *
 * Server-only: reads generated types. Only plain fields come out — the final
 * entry's, never the drafts `TeamService.Get` also hands over (see
 * `TODO(backend: submission-cross-team-read)` in `teamEntries`).
 *
 * @param submissions the team's, in any order — `submissionEntry` sorts them.
 */
export function submissionView(
  hackathon: Hackathon,
  team: Team,
  submissions: Submission[],
) {
  // Not checked against this hackathon's projects on purpose — see the team
  // page's load: that list is filtered to what the viewer may see.
  const project = hackathon.projects.find((p) => p.id === team.projectId)

  // Who saved the entry, and who proposed the project — members and owners, so
  // an organiser who proposed without joining is named too.
  const names = namesByUserId(hackathon.members, hackathon.owners)
  const entry = submissionEntry(submissions, names)
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  return {
    teamId: team.id,
    teamName: team.name,
    projectTitle: project?.title ?? "Unknown project",
    // TODO(backend: team-image): Team has no image of its own, so the
    // project's is the only one there is.
    imageUrl: project?.image,
    // The id is the participant profile's: `participants/<userId>`.
    members: team.members.map((m) => ({
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
  }
}
