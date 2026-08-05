import type { PageServerLoad } from "./$types"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { mayReviewProjects } from "$lib/server/hackathon/capabilities"
import { error } from "@sveltejs/kit"

// Read-only: every action a project has — approve, revoke, prefer, edit — lives
// on a list page (see $lib/navigation's manageNav for the organiser's), so this
// route only has to decide who may read it.
export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // project at every status, plus the tracks and the members that name the
  // proposer. Same source All Projects and Proposals read.
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

  // A proposal awaiting a decision is its author's business and the reviewer's,
  // not something to browse — All Projects lists the approved ones only, so
  // nothing offers this page for a pending project to anyone else.
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
  // directly still sees a pending proposal.
  const isPending = project.status === ProjectStatus.PROJECT_STATUS_PROPOSED
  if (
    isPending &&
    !isCreator &&
    !mayReviewProjects(myMembership ?? undefined, isAdmin)
  ) {
    error(403, "This project is still awaiting review")
  }

  // `Project` carries only `creatorId`, so the name comes from the membership
  // list that arrived in the same response. A proposer who has since left the
  // hackathon resolves to nothing and the page omits the line, rather than
  // printing a raw uuid at someone.
  const memberNames = new Map(
    hackathon.members
      .filter((m) => m.user !== undefined)
      .map((m) => [m.user!.id, m.user!.displayName || m.user!.username]),
  )
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  return {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      imageUrl: project.image,
      track: project.trackId ? trackNames.get(project.trackId) : undefined,
      proposer: memberNames.get(project.creatorId),
      createdAt: project.createdAt,
      modifiedAt: project.modifiedAt,
    },
    hackathonId: hackathon.id,
  }
}
