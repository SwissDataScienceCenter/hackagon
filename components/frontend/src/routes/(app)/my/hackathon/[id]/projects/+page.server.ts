import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { mayPreferProjects } from "$lib/server/hackathon/capabilities"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // project at every status.
  const { hackathon, myMembership } = await event.parent()

  const myId = event.locals.platformUser?.id
  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const isHackathonOwner =
    myMembership?.role === HackathonRole.HACKATHON_ROLE_OWNER

  // The subjects `Approve`/`Disapprove` accept — hackathon-level `project:write`
  // (`project_service.go:281`), held by the casbin Owner and by an admin through
  // the escape hatch. Courtesy only: both handlers enforce it for real.
  const mayReview = isHackathonOwner || isAdmin

  // Which of these projects the caller already prefers. Read-only and
  // decorative — swallow the error and show nothing preferred rather than
  // fail the whole load, same as the `hackathon.list`/`page.list` chrome calls
  // in `(app)/+layout.server.ts`.
  let preferredIds = new Set<string>()
  const mayPrefer = mayPreferProjects(myMembership ?? undefined, isAdmin)
  if (mayPrefer) {
    try {
      const { project } = requireGrpc(event.locals.grpc)
      const { projectIds } = await project.getPreference({
        hackathonId: hackathon.id,
      })
      preferredIds = new Set(projectIds)
    } catch {
      // No preferences to show — the "Prefer" button still works either way.
    }
  }

  // A reviewer sees proposals too — that is the whole point of deciding from
  // this page. Everyone else sees approved projects only: a proposal awaiting a
  // decision is its author's business, and Proposals is where they follow it.
  //
  // Frontend-only. `hackathon.get` returns every project whatever the caller's
  // role, so this shapes the page rather than enforcing anything; a member
  // calling the API directly still sees pending proposals.
  const visible = hackathon.projects.filter(
    (p) =>
      p.status === ProjectStatus.PROJECT_STATUS_APPROVED ||
      (mayReview && p.status === ProjectStatus.PROJECT_STATUS_PROPOSED),
  )

  const isPending = (s: number) => s === ProjectStatus.PROJECT_STATUS_PROPOSED

  // Awaiting review first for a reviewer — those are the ones asking for an
  // action. Newest first within each group, matching how the page has read.
  const ordered = [...visible].sort((a, b) => {
    if (isPending(a.status) !== isPending(b.status)) {
      return isPending(a.status) ? -1 : 1
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

  // Tracks arrive nested in the same response. A project whose track was
  // deleted resolves to nothing and the card omits it.
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
    // generated enum across the server-only boundary to compare a status.
    isPending: isPending(p.status),
    // The three subjects `ProjectService.Edit` accepts, and the same test the
    // edit route gates on: the proposer, the hackathon owner, an admin. Per
    // project, because the proposer differs row to row.
    //
    // Note the second and third let an owner or admin edit someone else's
    // proposal. That is what the backend allows — `Edit` falls back to a
    // hackathon-wide project:write check (`project_service.go:479-484`) — so
    // offering it here matches the existing edit route rather than quietly
    // narrowing it. Whether it *should* be allowed is a separate question.
    mayEdit: (myId !== undefined && p.creatorId === myId) || mayReview,
    isPreferred: preferredIds.has(p.id),
  }))

  // `hackathonId` so the page can build the link to the propose form —
  // unresolved, since `resolve()` belongs at the anchor itself.
  return {
    projects,
    hackathonId: hackathon.id,
    mayReview,
    mayPrefer,
  }
}

/** Shared by every action here: they all act on one project id from the form. */
function projectIdFrom(form: FormData): string | undefined {
  const id = form.get("projectId")
  return typeof id === "string" && id !== "" ? id : undefined
}

/** The gRPC errors all three write paths can return, as SvelteKit failures. */
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

  // Revoking an approval, not rejecting. `ProjectService.Disapprove` sets the
  // status back to PROPOSED (`project_service.go:242`) — the state a project was
  // in before anyone looked at it — so this returns a project to the queue.
  //
  // TODO(backend: project-rejected-status): there is no reject, so this page
  // offers none. `ProjectStatus` has only PROPOSED and APPROVED, and a rejected
  // proposal would be indistinguishable from an unreviewed one. Once a REJECTED
  // status (ideally with a reason) exists, add that as a separate action and
  // leave this one meaning what its name says.
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

  prefer: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)

    const projectId = projectIdFrom(await event.request.formData())
    if (!projectId) return fail(400, { message: "No project was given" })

    try {
      await project.setPreference({ projectId })
    } catch (e) {
      return failFor(
        e,
        "You can't mark projects as preferred in this hackathon",
      )
    }

    return { preferredId: projectId }
  },

  unprefer: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)

    const projectId = projectIdFrom(await event.request.formData())
    if (!projectId) return fail(400, { message: "No project was given" })

    try {
      await project.removePreference({ projectId })
    } catch (e) {
      return failFor(
        e,
        "You can't change project preferences in this hackathon",
      )
    }

    return { unpreferredId: projectId }
  },
}
