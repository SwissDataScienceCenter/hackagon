import type { AuthorizedGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"

/**
 * Server-only: reads generated types, so it must never be imported by a
 * component. Shared by the participant project route and the organiser's under
 * `projects/manage`, so the two show the same record of the same decision.
 */

/**
 * The text `ProjectService.Reject` writes as its own comment, every time, before
 * the organiser's reason (`project_service.go:295-303`). A marker rather than
 * something anyone typed: it becomes the attribution line below, and never a
 * line of its own.
 */
const REJECTION_MARKER = "Project rejected"

/** What a rejection left behind, as `ProjectReview` renders it. */
export type ProjectReview = {
  /** Display name of whoever rejected it; "" when the backend held none. */
  rejectedBy: string
  rejectedAt?: Date
  /** What the organiser wrote, in the order written. Empty when none was given. */
  reasons: { id: string; text: string }[]
}

/**
 * The record of a project's rejection, or `undefined` when there is none to
 * show — which is every project that was not rejected, so callers can render the
 * whole section on the presence of this value alone.
 *
 * **This is the one read on either detail route that needs an RPC of its own.**
 * Both pages otherwise live off the layout's `hackathon.get`, which hydrates a
 * project's creator, modifier and track but *not* its comments
 * (`hackathon_service.go:154`) — so `hackathon.projects[].comments` is always
 * empty and cannot be used. `ProjectService.Get` is the only reader that fills
 * them in (`project_service.go:101`).
 *
 * Called only for a rejected project, which is why the status is a parameter
 * rather than the caller's business: `Reject` is the only writer of a
 * `ProjectComment`, so any other status has nothing to fetch and this returns
 * without a round trip. That keeps the extra call off every other project page.
 *
 * The marker comment is split out from the reasons rather than shown as one of
 * them. Rejecting with a reason leaves two comments — "Project rejected", then
 * the reason — with the same author and timestamp on both, so rendering them as
 * two notes printed that pair twice and gave the first line nothing to say the
 * status badge had not. Dropping the marker outright would have lost the only
 * record of *who* rejected the project and *when*, since `Project` carries no
 * `rejectedBy` or `rejectedAt` field; promoting it to the section's heading keeps
 * that fact and states it once.
 *
 * Matching on the text is the coupling that buys this, and position would not
 * work in its place: once a project has been rejected, reconsidered and rejected
 * again the markers are interleaved with the reasons, and nothing on
 * `ProjectComment` marks one. Where several rejections are on record the **last**
 * marker supplies the attribution — that is the decision currently in force.
 *
 * Failure is swallowed. This explains a decision the page has already stated
 * through its badge, so losing it degrades the page rather than breaking it — the
 * same treatment the preferences read gets on the projects list, and better than
 * 500-ing a project page over its explanation.
 */
export async function projectReviewFor(
  grpc: AuthorizedGrpc,
  projectId: string,
  status: number,
): Promise<ProjectReview | undefined> {
  if (status !== ProjectStatus.PROJECT_STATUS_REJECTED) return undefined

  try {
    const { project } = await grpc.project.get({ projectId })
    const comments = project?.comments ?? []

    const markers = comments.filter((c) => c.text === REJECTION_MARKER)
    const latest = markers[markers.length - 1]
    const reasons = comments
      .filter((c) => c.text !== REJECTION_MARKER)
      .map((c) => ({ id: c.id, text: c.text }))

    // Nothing on record at all — a rejected project whose comments the backend
    // did not return. Rendering a heading over an empty section would say less
    // than the badge already does.
    if (!latest && reasons.length === 0) return undefined

    return {
      rejectedBy: latest?.userName ?? "",
      rejectedAt: latest?.createdAt,
      reasons,
    }
  } catch {
    // Nothing to show; the status badge still says what happened.
    return undefined
  }
}
