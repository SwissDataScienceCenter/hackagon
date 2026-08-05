import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayPreferProjects } from "$lib/server/hackathon/capabilities"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// No owner/admin check here: reviewing proposals is an organiser action and
// lives on Manage Projects, which gates itself (see $lib/navigation's manageNav)
// and owns the Approve/Revoke actions. This page is the participant view and
// reads the same for everyone.
export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // project at every status.
  const { hackathon, myMembership } = await event.parent()

  const myId = event.locals.platformUser?.id
  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )

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

  // Approved projects, and only those, whoever is looking. A proposal awaiting a
  // decision is its author's business — they follow it on Proposals — and the
  // reviewer's, who sees every status on Manage Projects. This page therefore
  // reads identically for a member and an owner, which is the point of the
  // split: what an owner gains is a page of their own, not a different version
  // of this one.
  //
  // Frontend-only. `hackathon.get` returns every project whatever the caller's
  // role, so this shapes the page rather than enforcing anything.
  const approved = hackathon.projects.filter(
    (p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED,
  )

  // Newest first, as the page has always read. No pending group to hoist above
  // them any more.
  const ordered = [...approved].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )

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
    // The proposer only. `ProjectService.Edit` also accepts the hackathon owner
    // and an admin (`project_service.go:479-484`), and they get the same control
    // on Manage Projects — offering it to them here as well would put the same
    // organiser action on two pages, which is what this split undoes.
    mayEdit: myId !== undefined && p.creatorId === myId,
    isPreferred: preferredIds.has(p.id),
  }))

  // `hackathonId` so the page can build the link to a project —
  // unresolved, since `resolve()` belongs at the anchor itself.
  return {
    projects,
    hackathonId: hackathon.id,
    mayPrefer,
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
