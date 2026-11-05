import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { namesByUserId } from "$lib/server/hackathon/membership"
import { submissionEntry } from "$lib/server/hackathon/submissions"
import { markdownExcerpt } from "$lib/utils/markdown"
import { PROJECT_EXCERPT_CHARS } from "$lib/utils/projectExcerpt"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * One team: who is on it, the project it works on, and whether it has handed
 * anything in. Reached from the teams list, a participant's profile, a
 * project's page and the Submissions page.
 *
 * The entry itself is not shown here, only that it exists and when it was
 * saved: it is read on the Submissions page, which is where the ballot and the
 * results link to as well, so there is one place that shows it.
 *
 * `TeamService.Get` eager-loads every submission a team has, drafts included
 * (see `TODO(backend: submission-cross-team-read)` in `teamEntries`).
 * `submissionEntry` keeps the final one, and only its date and author leave
 * the server — the same containment `teamEntries` relies on.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon, votingEnabled } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)

  let found
  try {
    ;({ team: found } = await team.get({ teamId: event.params.teamId }))
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "That team does not exist.")
    }
    if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
      // A malformed id in the URL, not a missing team — same thing to a reader.
      error(404, "That team does not exist.")
    }
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You cannot view teams in this hackathon.")
    }
    throw e
  }
  if (!found) error(404, "That team does not exist.")

  // Not checked against this hackathon's teams on purpose. `Get` already
  // enforces `hackathon:read` on the hackathon the team actually belongs to, so a
  // wrong-hackathon URL cannot reveal a team the viewer could not otherwise read
  // — it only mislabels the way back. Gating on `hackathon.projects` instead
  // would 404 legitimate teams, since that list is filtered to what the viewer
  // may see and a team can sit on a project that is not in it.
  const project = hackathon.projects.find((p) => p.id === found.projectId)

  // Where the back link goes, since there are several ways in. Read from an
  // explicit `?from` rather than the Referer header: a bookmark, a reload or a
  // shared URL sends no referrer. Only the value the teams list sets is
  // honoured, so an arbitrary query string cannot point the link anywhere else.
  //
  // `votingEnabled` is the second half, and it is not a nicety. The ballot used
  // to be the only way in, which made voting a safe default — reaching this page
  // at all meant voting was open. The teams list is reachable whether or not it
  // is, so a reader arriving with no `?from` (a bookmark, or the return trip from
  // the proposal below) would otherwise be handed a link to a ballot they cannot
  // open. The teams list is always a real destination for a team that exists.
  const backToTeams =
    event.url.searchParams.get("from") === "teams" || !votingEnabled

  // Who saved the entry, and who proposed the project — members and owners, so
  // an organiser who proposed without joining is named too.
  const names = namesByUserId(hackathon.members, hackathon.owners)
  const entry = submissionEntry(found.submissions, names)
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  return {
    hackathonId: event.params.id,
    // Its own id, so the project link can carry a way back to this page, and
    // the entry link can point at this team's card on Submissions. Taken from
    // the team the backend returned rather than from the URL, so neither can
    // inherit a malformed id that `Get` would have already refused.
    teamId: found.id,
    backToTeams,
    teamName: found.name,
    // The project as the projects list draws it, so the card reads the same in
    // both places.
    //
    // Approved only. `projects/<id>` answers 403 for a `PROPOSED` project unless
    // the viewer proposed it or reviews proposals, so the card's View link
    // would offer a refusal; only an approved project has teams in the first
    // place. `undefined` also covers the project not resolving at all — the
    // page then has no project section rather than an empty one.
    project:
      project?.status === ProjectStatus.PROJECT_STATUS_APPROVED
        ? {
            id: project.id,
            title: project.title,
            excerpt: markdownExcerpt(
              project.description,
              PROJECT_EXCERPT_CHARS,
            ),
            creator: names.get(project.creatorId),
            track: project.trackId
              ? trackNames.get(project.trackId)
              : undefined,
            // TODO(backend: team-image): Team has no image of its own, so the
            // project's is the only one there is.
            imageUrl: project.image,
          }
        : undefined,
    // When and by whom, nothing more: the content is read on Submissions.
    entry: entry
      ? { updatedAt: entry.updatedAt, updatedBy: entry.updatedBy }
      : null,
    // The id is the participant profile's: `participants/<userId>`.
    members: found.members.map((m) => ({
      id: m.id,
      name: m.displayName || m.username,
    })),
  }
}
