import type { RequestHandler } from "./$types"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayReviewProjects } from "$lib/server/hackathon/capabilities"
import { requireGrpc } from "$lib/server/grpc/client"
import {
  namesByUserId,
  viewerMembership,
} from "$lib/server/hackathon/membership"
import { csvFilename } from "$lib/utils/csv"
import { projectCsv, type ProjectCsvRow } from "$lib/utils/projectCsv"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * The project list as a CSV — what was proposed, by whom, in full.
 *
 * A `+server.ts` rather than a load, same reason the participant roster gives:
 * this is a download, not a page. No RPC hands it finished bytes, so it builds
 * the file out of the projects and members `Hackathon.Get` already returns, and
 * the hackathon-dependent filename rides in `Content-Disposition` because a
 * name that changes per hackathon cannot sit in a static route segment.
 *
 * **Every project, at every status, whatever tab the page is on.** The review
 * queue shows one status at a time; a download whose contents depend on which
 * tab was open when it was clicked is a trap, the same one the participant
 * export refuses by ignoring its search box. The Status column is what makes
 * that safe — a rejected proposal is in the file, labelled, not silently
 * mixed in with the line-up.
 */
export const GET: RequestHandler = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)

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

  // A `+server.ts` runs no layout loads, so the gate the manage page applies is
  // re-derived here, through the same helper that page's load uses so the two
  // cannot disagree about who is let in. It carries real weight: this file
  // includes proposals nobody has approved and proposals that were turned down.
  //
  // Through `viewerMembership`, not a plain `members.find` — an organiser who
  // never joined their own hackathon holds ownership on the owners edge and no
  // participant row at all, and finding them by member row alone would refuse
  // the very person the page showed the button to.
  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const membership = viewerMembership(
    h.members,
    h.owners,
    event.locals.platformUser?.id,
    h.createdAt,
  )
  if (!mayReviewProjects(membership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can export projects")
  }

  // Approved is "neither of the others", matching the page's load: a project
  // carrying an unspecified status gets a label rather than an empty cell.
  const isPending = (s: number) => s === ProjectStatus.PROJECT_STATUS_PROPOSED
  const isRejected = (s: number) => s === ProjectStatus.PROJECT_STATUS_REJECTED
  const label = (s: number) =>
    isPending(s) ? "Proposed" : isRejected(s) ? "Rejected" : "Approved"

  // The order the queue is in on screen — awaiting review first, then the
  // line-up, rejected last — so the file reads as the page does rather than as
  // some second opinion about what matters.
  const rank = (s: number) => (isRejected(s) ? 2 : isPending(s) ? 0 : 1)
  const ordered = [...h.projects].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )

  // `Project` carries only `creatorId`, so the name comes from the people the
  // same response already named — the member list **and the owners edge**,
  // since an organiser who never joined their own hackathon is only in the
  // second and it is their own proposals that would otherwise go out unsigned.
  // A proposer who has genuinely left resolves to nothing and the cell stays
  // empty, which is better than printing a raw uuid into a spreadsheet.
  const names = namesByUserId(h.members, h.owners)

  const rows: ProjectCsvRow[] = ordered.map((p) => ({
    title: p.title,
    creator: names.get(p.creatorId) ?? "",
    status: label(p.status),
    description: p.description,
  }))

  return new Response(projectCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(h.name, "projects")}"`,
      // Every approval and every edit changes this; a cached copy of the list
      // from before one is worse than a second round trip.
      "Cache-Control": "no-store",
    },
  })
}
