import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { submissionVersions } from "$lib/server/hackathon/submissions"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * One team, its project and the entry it filed — the page a voter goes to before
 * casting a vote. Reached from the ballot, which lists a project title and a team
 * name and is not enough to judge on.
 *
 * TODO(backend: submission-cross-team-read): this reads `TeamService.Get`, which
 * eager-loads *every* submission a team has and gates only on hackathon-scoped
 * `hackathon:read` (`team_service.go:91-121`) — it never checks
 * `submission:read`. Only `latestFinal` survives this load, so no draft of
 * another team's reaches the browser. Once a hackathon-wide, finals-only read
 * path exists, switch to it and drop the filtering here.
 *
 * Finals-only for everyone, including a member of the team being shown: their own
 * drafts and version history already have a page (`/submissions`), and keeping
 * one rule here means there is no viewer-dependent filter to get wrong.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

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

  // Finalizer names, resolved against every confirmed hackathon member rather
  // than the team's current roster — the person who finalized may since have left
  // the team. Same map and fallback as the submissions page.
  const memberNames = new Map(
    hackathon.members
      .filter((m) => m.user !== undefined)
      .map((m) => [m.user!.id, m.user!.displayName || m.user!.username]),
  )

  const { latestFinal } = submissionVersions(found.submissions, memberNames)

  return {
    hackathonId: event.params.id,
    teamName: found.name,
    // The project is what a voter is judging, so it is the heading; the team's
    // own description is the fallback for a team whose project the viewer cannot
    // resolve.
    projectTitle: project?.title ?? found.name,
    projectDescription: project?.description ?? found.description ?? "",
    // TODO(backend: team-image): Team has no image of its own, so this is the
    // project's. Without one the card falls back to its empty avatar.
    imageUrl: project?.image,
    members: found.members.map((m) => ({ name: m.displayName || m.username })),
    isOwn: found.members.some((m) => m.id === platformUserId),
    entry: latestFinal
      ? {
          version: latestFinal.version,
          result: latestFinal.result,
          finalizedAt: latestFinal.finalizedAt,
          finalizedBy: latestFinal.finalizedBy,
        }
      : null,
  }
}
