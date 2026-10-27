import type { RequestHandler } from "./$types"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { requireGrpc } from "$lib/server/grpc/client"
import { mayViewAllSubmissions } from "$lib/server/hackathon/capabilities"
import {
  namesByUserId,
  viewerMembership,
} from "$lib/server/hackathon/membership"
import {
  submissionOverview,
  submissionsByTeam,
} from "$lib/server/hackathon/submissions"
import { listVisibleTeams } from "$lib/server/hackathon/teams"
import { csvFilename } from "$lib/utils/csv"
import { submissionCsv, type SubmissionCsvRow } from "$lib/utils/submissionCsv"
import { SUBMISSION_FILTER_LABEL } from "$lib/utils/submissionFilter"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * Manage Submissions as a CSV — every team, where it stands, and its entry.
 *
 * A `+server.ts` rather than a load, same reason the other exports give: this
 * is a download, not a page, and the hackathon-dependent filename rides in
 * `Content-Disposition`.
 *
 * **Every team, whatever tab the page is on**, in the page's order. A download
 * whose contents depend on which tab was open is a trap, the one the project
 * export refuses too; the Standing column is what keeps the three apart.
 */
export const GET: RequestHandler = async (event) => {
  const { hackathon, team } = requireGrpc(event.locals.grpc)

  // Same translation the hackathon layout does: without it a non-member's
  // PermissionDenied from `Get` surfaces as a 500 on a download.
  let h
  try {
    h = (await hackathon.get({ hackathonId: event.params.id })).hackathon
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You are not a confirmed member of this hackathon")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Hackathon not found")
    }
    throw e
  }
  if (!h) error(404, "Hackathon not found")

  // A `+server.ts` runs no layout loads, so the page's gate is re-derived here,
  // through `viewerMembership` so an organiser who never joined is still found.
  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const membership = viewerMembership(
    h.members,
    h.owners,
    event.locals.platformUser?.id,
    h.createdAt,
  )
  if (!mayViewAllSubmissions(membership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can export submissions")
  }

  const teams = await listVisibleTeams(team, h.id)
  if (teams === undefined) {
    error(403, "The teams of this hackathon cannot be read with your account")
  }

  const overview = submissionOverview(
    teams,
    await submissionsByTeam(team, h.id),
    new Map(h.projects.map((p) => [p.id, p.title])),
    namesByUserId(h.members, h.owners),
  )

  const rows: SubmissionCsvRow[] = overview.map((r) => {
    // The page's "entry that counts", and its newer draft when there is one.
    const entry = r.latestFinal ?? r.latest
    const newerDraft =
      r.latestFinal && r.latest && r.latest.id !== r.latestFinal.id
        ? r.latest.version
        : undefined

    return {
      team: r.teamName,
      project: r.projectTitle,
      members: r.members,
      standing: SUBMISSION_FILTER_LABEL[r.standing],
      version: entry?.version,
      submittedAt: entry?.createdAt,
      submittedBy: entry?.creator,
      finalizedAt: entry?.finalizedAt,
      finalizedBy: entry?.finalizedBy,
      newerDraft,
      result: entry?.result,
    }
  })

  return new Response(submissionCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(h.name, "submissions")}"`,
      // A team can submit at any moment; a cached copy from before is worse
      // than a second round trip.
      "Cache-Control": "no-store",
    },
  })
}
