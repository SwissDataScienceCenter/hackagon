import type { AuthorizedGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"

/**
 * Server-only: reads generated types, so it must never be imported by a
 * component. Shared by the participant project route and the organiser's under
 * `projects/manage`, so the two show the same record of the same decision.
 */

/** One note as `ProjectReviewNotes` wants it. */
export type ReviewNote = {
  id: string
  /** Display name of whoever wrote it; "" when the backend held none. */
  author: string
  text: string
  createdAt?: Date
}

/**
 * The review notes on a project, or an empty list when there are none to fetch.
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
 * Failure is swallowed. The notes explain a decision the page has already
 * stated through its badge, so losing them degrades the page rather than
 * breaking it — the same treatment the preferences read gets on the projects
 * list, and better than 500-ing a project page over its explanation.
 */
export async function reviewNotesFor(
  grpc: AuthorizedGrpc,
  projectId: string,
  status: number,
): Promise<ReviewNote[]> {
  if (status !== ProjectStatus.PROJECT_STATUS_REJECTED) return []

  try {
    const { project } = await grpc.project.get({ projectId })
    return (project?.comments ?? []).map((c) => ({
      id: c.id,
      author: c.userName,
      text: c.text,
      createdAt: c.createdAt,
    }))
  } catch {
    // No notes to show; the status badge still says what happened.
    return []
  }
}
