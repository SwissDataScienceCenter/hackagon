import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayReviewProjects } from "$lib/server/hackathon/capabilities"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // project at every status.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Frontend-only gate, same shape as the other manage routes: the two RPCs
  // below enforce it for real, this only decides whether the page renders.
  if (!mayReviewProjects(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can review projects")
  }

  const isPending = (s: number) => s === ProjectStatus.PROJECT_STATUS_PROPOSED
  const isRejected = (s: number) => s === ProjectStatus.PROJECT_STATUS_REJECTED

  // Where a status sits in the queue. Awaiting review first, since those are the
  // rows asking for an action; then approved, which is the hackathon's actual
  // line-up; rejected last, kept reachable only so a decision can be taken back.
  // An unspecified status sorts with the pending rows rather than vanishing
  // among the rejected ones — it is an anomaly someone should look at.
  const rank = (s: number) => (isRejected(s) ? 2 : isPending(s) ? 0 : 1)

  // Every project at every status — this is the review queue, and an approved or
  // rejected one still needs to be reachable to have that decision undone.
  // Newest first within each group.
  const ordered = [...hackathon.projects].sort((a, b) => {
    if (rank(a.status) !== rank(b.status)) {
      return rank(a.status) - rank(b.status)
    }
    return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
  })

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
  // set agree, but the number a project shows changes as approvals land. Swap
  // in the real field once it exists.
  const projects = ordered.map((p, i) => ({
    id: p.id,
    num: ordered.length - i,
    title: p.title,
    description: p.description,
    creator: memberNames.get(p.creatorId),
    track: p.trackId ? trackNames.get(p.trackId) : undefined,
    imageUrl: p.image,
    status: p.status,
    // Derived here rather than in the component, so no page has to import the
    // generated enum across the server-only boundary to compare a status. The
    // two flags are exhaustive between them for the page's purposes: neither set
    // means approved, which is the only status offering "revoke".
    isPending: isPending(p.status),
    isRejected: isRejected(p.status),
  }))

  return {
    projects,
    hackathonId: hackathon.id,
    pendingCount: projects.filter((p) => p.isPending).length,
  }
}

/** Shared by both actions here: they act on one project id from the form. */
function projectIdFrom(form: FormData): string | undefined {
  const id = form.get("projectId")
  return typeof id === "string" && id !== "" ? id : undefined
}

/** The gRPC errors both write paths can return, as SvelteKit failures. */
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

    const projectId = projectIdFrom(await event.request.formData())
    if (!projectId) return fail(400, { message: "No project was given" })

    try {
      await project.approve({ projectId })
    } catch (e) {
      return failFor(e, "You don't have permission to approve projects here")
    }

    // No redirect: SvelteKit re-runs `load` after an action, so the badge turns
    // Approved and the card moves out of the awaiting-review group on its own.
    return { approvedId: projectId }
  },

  // Undoing a decision, whichever way it went. `ProjectService.Disapprove` sets
  // the status back to PROPOSED (`project_service.go:322`) — the state a project
  // was in before anyone looked at it — so this returns a project to the queue
  // from either side of it. The page labels the same action "Revoke approval" on
  // an approved project and "Reconsider" on a rejected one, because those are
  // two different things to want and one thing to do.
  //
  // Rejecting is not here: it takes a reason, and a textarea does not fit a card
  // row. It lives on `manage/<id>`, where the proposal is read in full — see
  // that route's own `reject` action.
  disapprove: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)

    const projectId = projectIdFrom(await event.request.formData())
    if (!projectId) return fail(400, { message: "No project was given" })

    try {
      await project.disapprove({ projectId })
    } catch (e) {
      return failFor(e, "You don't have permission to review projects here")
    }

    return { disapprovedId: projectId }
  },
}
