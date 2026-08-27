import type { Actions, PageServerLoad } from "./$types"
import { resolve } from "$app/paths"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayReviewProjects } from "$lib/server/hackathon/capabilities"
import { projectReviewFor } from "$lib/server/hackathon/projectReview"
import { projectFilterFrom, projectFilterQuery } from "$lib/utils/projectFilter"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The review: one project read in full, and every decision that can be taken on
// it. Approve, Reject and returning it to the queue all live here rather than on
// the list, so a judgement is made under the description it is a judgement of.
//
// Exactly two of the three are offered at a time — the two states the project is
// not already in:
//
//   awaiting review → Approve · Reject
//   approved        → Revoke approval · Reject
//   rejected        → Approve · Reconsider
//
// "Revoke approval" and "Reconsider" are one RPC, `Disapprove`, which sets the
// status back to PROPOSED (`project_service.go:322`) — from an approved project
// that is taking an approval back, from a rejected one it is agreeing to look
// again.
export const load: PageServerLoad = async (event) => {
  // No RPC for the project itself: the layout's `hackathon.get` already returns
  // every project at every status, plus the tracks and the members that name the
  // proposer. Only the review record needs a call of its own — see
  // `projectReviewFor`.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Same gate as the queue this is reached from, via the same helper so the two
  // cannot disagree. Unlike the participant detail route, no status check
  // follows: seeing a pending proposal is the point. It is also the gate all
  // three actions below need, which their RPCs enforce for real
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

  const isPending = project.status === ProjectStatus.PROJECT_STATUS_PROPOSED
  const isRejected = project.status === ProjectStatus.PROJECT_STATUS_REJECTED

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
    // Each flag is "not already in that state". `Reject` and `Approve` both take
    // a project in any status, so an approved project can be turned down without
    // being revoked first — which is the point, since an organiser who changes
    // their mind wants to say why in the same step.
    mayApprove: isPending || isRejected,
    mayReject: !isRejected,
    mayReturnToQueue: !isPending,
    // Which label the Disapprove button wears. Same RPC, two things to want.
    returnLabel: isRejected ? "Reconsider" : "Revoke approval",
    // The queue view this was opened from, carried so every decision returns to
    // it — see `queueQueryFrom`.
    queueQuery: queueQueryFrom(event.url),
    hackathonId: hackathon.id,
  }
}

/**
 * The queue view this page was opened from, as a query string to append to the
 * list's path.
 *
 * Round-tripped through the URL rather than kept in session state, so the back
 * link and a redirect after deciding both land on the view the organiser was
 * working through — not wherever the queue's default happens to point once their
 * decision has changed the counts. Approving the last pending proposal returns
 * them to an "Nothing is awaiting review" list, which is the truth, rather than
 * silently moving them to the approved one.
 *
 * `""` when nothing recognizable was carried, which hands the choice back to the
 * queue's own default rather than inventing one here. Only this app's own
 * vocabulary is ever echoed back, so a hand-typed parameter cannot introduce a
 * target the queue would not have chosen itself.
 */
function queueQueryFrom(url: URL): string {
  const filter = projectFilterFrom(url.searchParams.get("status"))
  return filter ? projectFilterQuery(filter) : ""
}

/** Where every decision lands: the queue, on the slice it came from. */
function backToQueue(event: { params: { id: string }; url: URL }): never {
  redirect(
    303,
    `${resolve(`/my/hackathon/${event.params.id}/projects/manage`)}${queueQueryFrom(event.url)}`,
  )
}

/** The gRPC errors every write path here can return, as SvelteKit failures. */
function failFor(e: unknown, denied: string) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
    return fail(403, { message: denied })
  }
  if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
    return fail(404, { message: "That project no longer exists" })
  }
  if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
    return fail(400, { message: e.details })
  }
  throw e
}

export const actions: Actions = {
  approve: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)

    try {
      await project.approve({ projectId: event.params.projectId })
    } catch (e) {
      return failFor(e, "You don't have permission to approve projects here")
    }

    backToQueue(event)
  },

  // Both "Revoke approval" and "Reconsider": one RPC, and which of the two it
  // reads as depends only on where the project started.
  disapprove: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)

    try {
      await project.disapprove({ projectId: event.params.projectId })
    } catch (e) {
      return failFor(e, "You don't have permission to review projects here")
    }

    backToQueue(event)
  },

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
      return failFor(e, "You don't have permission to reject projects here")
    }

    backToQueue(event)
  },
}
