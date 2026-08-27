import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayReviewProjects } from "$lib/server/hackathon/capabilities"
import { projectReviewFor } from "$lib/server/hackathon/projectReview"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The organiser's read of one project, at any status — this is where a proposal
// is read in full before deciding on it.
//
// Not read-only any more, and for one action only: **rejecting**. Approving,
// revoking and reconsidering are single clicks and stay on the queue, so each
// still has exactly one place it can be done from. Rejecting could not join them
// there — it takes a reason, a textarea does not fit a card's action strip, and a
// reason is something you write *after* reading the proposal, which is here.
export const load: PageServerLoad = async (event) => {
  // No RPC for the project itself: the layout's `hackathon.get` already returns
  // every project at every status, plus the tracks and the members that name the
  // proposer. Only the review record needs a call of its own — see
  // `projectReviewFor`.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Same gate as the list this is reached from, via the same helper so the two
  // cannot disagree. Unlike the participant detail route, no status check
  // follows: seeing a pending proposal is the point. It is also the gate the
  // `reject` action below needs, which `ProjectService.Reject` enforces for real
  // (`project_service.go:274`).
  if (!mayReviewProjects(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can review projects")
  }

  const project = hackathon.projects.find(
    (p) => p.id === event.params.projectId,
  )
  if (!project) {
    error(404, "Project not found")
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
    // Undefined for anything but a rejected project, so the page renders the
    // whole section on its presence.
    review: await projectReviewFor(
      requireGrpc(event.locals.grpc),
      project.id,
      project.status,
    ),
    // Offered at any status but the one it leads to. `Reject` itself takes a
    // project in any state, so an approved project can be turned down without
    // being revoked first — which is the point, since an organiser who changes
    // their mind about an approved project wants to say why. Rejecting an
    // already-rejected one would only add a second identical note.
    mayReject: project.status !== ProjectStatus.PROJECT_STATUS_REJECTED,
    hackathonId: hackathon.id,
  }
}

export const actions: Actions = {
  // Turning a project down, with an optional note saying why.
  //
  // The note is not stored on the project: `Reject` writes it as a
  // `ProjectComment` — one reading "Project rejected" whatever happens, plus a
  // second carrying this text when it is non-empty (`project_service.go:295-321`).
  // `projectReviewFor` turns the first into the attribution line and this one
  // into the reason under it, both shown to the proposer.
  //
  // Empty is a legitimate answer and is sent as no comment at all rather than as
  // an empty one, so a rejection without a reason leaves one note instead of two.
  reject: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)

    const form = await event.request.formData()
    const raw = form.get("reason")
    const reason = typeof raw === "string" ? raw.trim() : ""

    // The same 2000 the proto's `buf.validate` allows
    // (`reject_request.proto:11`), checked here so an over-long reason is a
    // sentence on the form rather than an INVALID_ARGUMENT from the wire.
    if (reason.length > 2000) {
      return fail(400, { message: "A reason must be at most 2000 characters" })
    }

    try {
      await project.reject({
        projectId: event.params.projectId,
        reviewComment: reason === "" ? undefined : reason,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to reject projects here",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "That project no longer exists" })
      }
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      throw e
    }

    // No redirect, deliberately — unlike Approve on the queue, which moves a row
    // and is done. SvelteKit re-runs `load`, so this page comes back badged
    // Rejected with the reason the organiser just wrote showing under it: they
    // see what the proposer will see. Reconsidering is one click away on the
    // queue.
    return { rejected: true }
  },
}
