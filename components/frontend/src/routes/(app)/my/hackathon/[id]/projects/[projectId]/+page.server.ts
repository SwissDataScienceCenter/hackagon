import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { mayReviewProjects } from "$lib/server/hackathon/capabilities"
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

  // Where "back" goes. The projects list unless a team detail page sent the
  // reader here, in which case it returns to that team — a voter following the
  // chain from a ballot would otherwise land on a list they were never on.
  //
  // The team id is only ever used to build a path of our own, never followed as
  // a supplied URL, so the shape check is all this needs: a well-formed id that
  // names no team lands on that page's own 404, exactly as typing one would, and
  // anything malformed falls back to the list. The edit form redirects here
  // carrying no query at all and so keeps the list, unchanged.
  const fromTeam = event.url.searchParams.get("from") === "team"
  const teamId = event.url.searchParams.get("team") ?? ""
  const backToTeam = fromTeam && UUID.test(teamId)
  // The team page's own origin, forwarded one hop so returning there restores
  // its back link instead of resetting it. Only that page's own vocabulary is
  // passed on, so this cannot introduce a target it would not have chosen itself.
  const teamQuery =
    event.url.searchParams.get("teamFrom") === "teams" ? "?from=teams" : ""

  return {
    backHref: backToTeam
      ? `/my/hackathon/${hackathon.id}/teams/${teamId}`
      : `/my/hackathon/${hackathon.id}/projects`,
    // Separate from the path: `resolve()` takes a route, not a URL.
    backQuery: backToTeam ? teamQuery : "",
    backLabel: backToTeam ? "Back to the team" : "Back to projects",
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

/** 8-4-4-4-12 hex, the shape every id the backend issues takes. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
