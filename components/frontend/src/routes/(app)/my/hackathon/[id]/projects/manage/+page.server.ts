import type { PageServerLoad } from "./$types"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayReviewProjects } from "$lib/server/hackathon/capabilities"
import {
  DEFAULT_PROJECT_FILTER,
  PROJECT_FILTERS,
  projectFilterFrom,
  projectFilterQuery,
  type ProjectFilter,
} from "$lib/utils/projectFilter"
import { error } from "@sveltejs/kit"
import { markdownExcerpt } from "$lib/utils/markdown"
import { PROJECT_EXCERPT_CHARS } from "$lib/utils/projectExcerpt"

// The review queue: every project in the hackathon, one status at a time.
//
// **No actions of its own any more.** Approving, rejecting and returning a
// project to the queue all live on `manage/<id>`, under the description they are
// a judgement of — a decision is made in a review, not from a row you have not
// opened. Each row offers "Review", which is the link to that page, and "Edit",
// which is not a decision.
export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // project at every status.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Frontend-only gate, same shape as the other manage routes, via the same
  // helper the detail route uses so the two cannot disagree about who is let in.
  // The RPCs that page calls enforce it for real.
  if (!mayReviewProjects(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can review projects")
  }

  const isPending = (s: number) => s === ProjectStatus.PROJECT_STATUS_PROPOSED
  const isRejected = (s: number) => s === ProjectStatus.PROJECT_STATUS_REJECTED
  // Approved is "neither of the above" rather than an equality check, so a
  // project carrying an unspecified status lands in exactly one tab instead of
  // disappearing from all of them.
  const isApproved = (s: number) => !isPending(s) && !isRejected(s)

  const matches: Record<ProjectFilter, (s: number) => boolean> = {
    approved: isApproved,
    proposed: isPending,
    rejected: isRejected,
  }

  // Where a status sits in the queue. Awaiting review first, since those are the
  // rows asking for an action; then approved, which is the hackathon's actual
  // line-up; rejected last, kept reachable only so a decision can be taken back.
  const rank = (s: number) => (isRejected(s) ? 2 : isPending(s) ? 0 : 1)

  const ordered = [...hackathon.projects].sort((a, b) => {
    if (rank(a.status) !== rank(b.status)) {
      return rank(a.status) - rank(b.status)
    }
    return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
  })

  // Counted over every project, never over the rows on screen: the number an
  // organiser wants is usually the one on the tab they are not on.
  const counts = Object.fromEntries(
    PROJECT_FILTERS.map((f) => [
      f,
      hackathon.projects.filter((p) => matches[f](p.status)).length,
    ]),
  ) as Record<ProjectFilter, number>

  // From the address bar, so a view can be bookmarked and the back button works.
  // An absent or unrecognized value lands on the approved line-up, always — a
  // default that moved with the counts made a hackathon's projects look gone the
  // moment one proposal arrived.
  const filter =
    projectFilterFrom(event.url.searchParams.get("status")) ??
    DEFAULT_PROJECT_FILTER
  const shown = ordered.filter((p) => matches[filter](p.status))

  // `Project` carries only `creatorId`, so the name comes from the membership
  // list that arrived in the same response. A creator who has since left the
  // hackathon resolves to nothing and the card omits the line — better than
  // printing a raw uuid at someone.
  const memberNames = new Map(
    hackathon.members
      .filter((m) => m.user !== undefined)
      .map((m) => [m.user!.id, m.user!.displayName || m.user!.username]),
  )

  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  // TODO(backend: display-ordinals): `num` is a position in this list, not an
  // identifier. Project has no display number, so two viewers sorting the same
  // set agree, but the number a project shows changes as approvals land — and
  // now also as the filter changes, since it numbers the rows on screen rather
  // than the whole set. Swap in the real field once it exists.
  const projects = shown.map((p, i) => ({
    id: p.id,
    num: shown.length - i,
    title: p.title,
    excerpt: markdownExcerpt(p.description, PROJECT_EXCERPT_CHARS),
    creator: memberNames.get(p.creatorId),
    track: p.trackId ? trackNames.get(p.trackId) : undefined,
    imageUrl: p.image,
    status: p.status,
    isPending: isPending(p.status),
  }))

  return {
    projects,
    counts,
    filter,
    // Carried onto each row's Review link so deciding on a project returns to
    // the tab it was opened from, rather than to the default.
    filterQuery: projectFilterQuery(filter),
    hackathonId: hackathon.id,
  }
}
