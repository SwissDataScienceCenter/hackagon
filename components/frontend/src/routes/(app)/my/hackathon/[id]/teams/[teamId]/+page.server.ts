import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * One team and its project — who is on it and what they are building. Reached
 * from the teams list, a participant's profile, a project's page and the
 * Submissions page.
 *
 * The team's entry is not shown here: it lives on the Submissions page, which
 * is where the ballot and the results link to read it.
 *
 * `TeamService.Get` eager-loads every submission a team has, drafts included
 * (see `TODO(backend: submission-cross-team-read)` in `teamEntries`). None of
 * it is read here, so none of it reaches the browser.
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

  return {
    hackathonId: event.params.id,
    // Its own id, so the proposal link can carry a way back to this page. Taken
    // from the team the backend returned rather than from the URL, so the link
    // cannot inherit a malformed id that `Get` would have already refused.
    teamId: found.id,
    backToTeams,
    teamName: found.name,
    // The project is what a voter is judging, so it is the heading; the team's
    // own description is the fallback for a team whose project the viewer cannot
    // resolve.
    projectTitle: project?.title ?? found.name,
    projectDescription: project?.description ?? found.description ?? "",
    // TODO(backend: team-image): Team has no image of its own, so this is the
    // project's. Without one the card falls back to its empty avatar.
    imageUrl: project?.image,
    // Whether to offer the way through to the full proposal — the description as
    // markdown, plus the track, proposer and status this page does not carry.
    //
    // Approved only. `projects/<id>` answers 403 for a `PROPOSED` project unless
    // the viewer proposed it or reviews proposals, so linking one at a
    // participant would offer a refusal; only an approved project has teams in
    // the first place. `undefined` also covers the project not resolving at all,
    // where the heading is already the team's name and there is no id to point
    // at.
    projectId:
      project?.status === ProjectStatus.PROJECT_STATUS_APPROVED
        ? project.id
        : undefined,
    members: found.members.map((m) => ({ name: m.displayName || m.username })),
  }
}
