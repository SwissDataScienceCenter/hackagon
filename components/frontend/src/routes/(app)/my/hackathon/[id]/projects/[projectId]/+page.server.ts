import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { mayPreferProjects } from "$lib/server/hackathon/capabilities"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // project at every status, plus the tracks and the members that name the
  // proposer. Same source the list, My Projects and the review queue read.
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
  const isHackathonOwner =
    myMembership?.role === HackathonRole.HACKATHON_ROLE_OWNER

  // The same subjects `Approve` accepts — hackathon-level `project:write`, held
  // by the casbin Owner and by an admin through the escape hatch. A proposer's
  // project-scoped Owner role sits in a different casbin domain, so it does not
  // satisfy this and nobody can approve their own proposal.
  const mayReview = isHackathonOwner || isAdmin

  // A proposal awaiting a decision is its author's business and the reviewer's,
  // not something to browse. This mirrors the Projects list, which shows
  // approved projects only.
  //
  // Frontend-only, and deliberately so: `ProjectService.Get` grants
  // `project:read` to any member of the hackathon whatever the project's
  // status, so this hides a pending proposal from the UI rather than enforcing
  // anything. Anyone calling the API directly still sees it.
  const isPending = project.status === ProjectStatus.PROJECT_STATUS_PROPOSED
  if (isPending && !isCreator && !mayReview) {
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
    // What the viewer may do here, decided server-side. `Edit` accepts the same
    // three subjects the edit page gates on; `Approve` only the two above.
    mayEdit: isCreator || isHackathonOwner || isAdmin,
    mayApprove: mayReview && isPending,
    // The other half of the same decision, matching the projects list: an
    // approved project can be returned to the queue, which is what Disapprove
    // does. Nothing to revoke on one that was never approved.
    mayRevoke: mayReview && !isPending,
    // `!isPending` too: a proposal nobody has approved is not yet something to
    // express a preference between.
    mayPrefer:
      !isPending && mayPreferProjects(myMembership ?? undefined, isAdmin),
    hackathonId: hackathon.id,
  }
}

export const actions: Actions = {
  // TODO(backend: project-rejected-status): there is no reject, so this page
  // offers none — only approve and its undo. `ProjectStatus` has only PROPOSED
  // and APPROVED, and `ProjectService.Disapprove` sets a project back to
  // PROPOSED, the state it was in before anyone looked at it. A rejected
  // proposal is therefore indistinguishable from an unreviewed one. Once a
  // REJECTED status (ideally with a reason) exists, add that as a third action
  // and show the decision here.
  approve: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)

    try {
      await project.approve({ projectId: event.params.projectId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to approve projects here",
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

    // No redirect: SvelteKit re-runs `load` after an action, so the badge turns
    // Approved and the button disappears on its own.
    return { approved: true }
  },

  // Revoking an approval, not rejecting: Disapprove returns the project to the
  // queue at PROPOSED. See the TODO above.
  disapprove: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)

    try {
      await project.disapprove({ projectId: event.params.projectId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to review projects here",
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

    return { disapproved: true }
  },

  // TODO(backend: project-preferences-readback): one-way on purpose, same gap
  // as the projects list. Nothing reads a member's own preferences back —
  // `hackathon.get`'s Project carries none and `ExportPreferences` is gated on
  // project:write — and no RPC undoes one, so the confirmation below lasts only
  // until the next load. Make it a real toggle once both exist.
  prefer: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)

    try {
      await project.setPreference({ projectId: event.params.projectId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You can't mark projects as preferred in this hackathon",
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

    return { preferred: true }
  },
}
