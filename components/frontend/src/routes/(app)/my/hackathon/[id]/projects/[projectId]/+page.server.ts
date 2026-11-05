import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { mayReviewProjects } from "$lib/server/hackathon/capabilities"
import { namesByUserId } from "$lib/server/hackathon/membership"
import { projectReviewFor } from "$lib/server/hackathon/projectReview"
import { error } from "@sveltejs/kit"

// Read-only: every action a participant has on a project — prefer, edit — lives
// on a list page, and the organiser's decisions live under Manage Projects (see
// $lib/navigation's manageNav), so this route only has to decide who may read it.
//
// For its proposer, this is where a rejection is explained: who turned it down
// and the reason they typed, which is why the load fetches the review record.
export const load: PageServerLoad = async (event) => {
  // No RPC for the project itself: the layout's `hackathon.get` already returns
  // every project at every status, plus the tracks and the members that name the
  // proposer. Same source the Projects page reads. Only the review record needs
  // a call of its own — see `projectReviewFor`.
  const { hackathon, myMembership } = await event.parent()

  const project = hackathon.projects.find(
    (p) => p.id === event.params.projectId,
  )
  if (!project) {
    error(404, "Project not found")
  }

  const isCreator = project.creatorId === event.locals.platformUser?.id
  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )

  // A project that is not approved is its author's business and the reviewer's,
  // not something to browse — the Projects page lists such a project to its
  // author alone, so nothing offers this page for one to anyone else.
  //
  // **Both undecided and rejected**, not just undecided. Gating on PROPOSED alone
  // left a rejected project readable by every member of the hackathon, which is
  // the opposite of what a rejection is: the decision and the organiser's reasons
  // for it are between them and the proposer.
  //
  // The two exemptions are load-bearing rather than legacy: saving the project
  // edit form redirects here, and that form is reachable for a pending project
  // by both its author and a reviewer. Narrowing this to approved-only would
  // land them on a 403 immediately after a successful save. A reviewer also has
  // `projects/manage/<id>`, which takes any status and returns to the queue.
  //
  // Frontend-only, and deliberately so: `ProjectService.Get` grants
  // `project:read` to any member of the hackathon whatever the project's status,
  // so this shapes the UI rather than enforcing anything. Anyone calling the API
  // directly still sees a pending proposal — and its review notes.
  const isPending = project.status === ProjectStatus.PROJECT_STATUS_PROPOSED
  const isRejected = project.status === ProjectStatus.PROJECT_STATUS_REJECTED
  if (
    (isPending || isRejected) &&
    !isCreator &&
    !mayReviewProjects(myMembership ?? undefined, isAdmin)
  ) {
    // Two sentences rather than one covering both: "still awaiting review" is an
    // invitation to come back, and for a rejected project that would be a lie.
    error(
      403,
      isPending
        ? "This project is still awaiting review"
        : "This project was not accepted",
    )
  }

  // `Project` carries only `creatorId`, so the name comes from the people the
  // same response already named — members and owners, so an organiser who
  // proposed without joining is named too. A proposer who has since left
  // resolves to nothing, and the page says so rather than printing a raw uuid
  // at someone.
  const names = namesByUserId(hackathon.members, hackathon.owners)
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  return {
    // Only when the reader came from nowhere the app remembers — BackLink
    // otherwise returns to the page they came from.
    backHref: `/my/hackathon/${hackathon.id}/projects`,
    backLabel: "Back to projects",
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      imageUrl: project.image,
      track: project.trackId ? trackNames.get(project.trackId) : undefined,
      proposer: names.get(project.creatorId),
      createdAt: project.createdAt,
      modifiedAt: project.modifiedAt,
    },
    // Only ever set for a rejected project, and by then only its proposer and an
    // organiser have got past the gate above — so no separate visibility rule is
    // needed for the review record itself.
    review: await projectReviewFor(
      requireGrpc(event.locals.grpc),
      project.id,
      project.status,
    ),
    hackathonId: hackathon.id,
  }
}
