import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import {
  mayPreferProjects,
  mayProposeProjects,
} from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// No owner/admin check here: reviewing proposals is an organiser action and
// lives under Manage Projects, which gates itself (see $lib/navigation's
// manageNav) and owns every decision — Approve, Revoke and Reconsider on the
// queue, Reject on a project's own page. This page is the participant view and
// reads the same for everyone — save for the proposals group, which is each
// viewer's own and empty for most of them.
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

  // The hackathon's projects: approved, and only those. A proposal awaiting a
  // decision is not yet one of them — it belongs to its author, who gets it back
  // in `myProposals` below, and to the reviewer, who sees every status on Manage
  // Projects. So this list reads identically for a member and an owner, which is
  // the point of the split: what an owner gains is a page of their own, not a
  // different version of this one.
  //
  // Frontend-only. `hackathon.get` returns every project whatever the caller's
  // role, so this shapes the page rather than enforcing anything.
  const approved = hackathon.projects.filter(
    (p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED,
  )

  // Newest first, as the page has always read.
  const ordered = [...approved].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )

  // Whether this hackathon takes proposals at all. One flag for the whole
  // proposal vocabulary on this page — the CTA and the group below — because
  // they are one feature: an organiser who switches the capability off is saying
  // "we put the projects up ourselves", and a page that then still showed a
  // proposals section would be describing a workflow nobody can use.
  //
  // No owner or admin bypass, deliberately: this section reads the same for
  // everyone. An organiser's own create path is `projects/manage/new`. See
  // `mayProposeProjects`.
  const takesProposals = mayProposeProjects(
    myMembership ?? undefined,
    enabledCapabilities(hackathon.state).includes(
      Capability.CAPABILITY_PROPOSE_PROJECTS,
    ),
  )

  // The viewer's own proposals that have not become projects, which used to be a
  // page of their own. Theirs alone rather than every pending one: a reviewer
  // reads the queue on Manage Projects, and this group exists so an author can
  // follow what they put forward, not to preview the queue.
  //
  // **Rejected ones belong here as much as pending ones.** Filtering to PROPOSED
  // alone made a rejected proposal vanish from its author's view entirely — not
  // in the approved list, not here, no badge and no explanation, as though it had
  // never been sent. Keeping it is the whole reason a rejection carries a reason:
  // the row is how its author finds out, and its page is where the note is read.
  //
  // Empty once proposals are off, which costs one narrow case: a member who
  // proposed while they were open stops seeing their own decided row. It is
  // still in the organiser's queue and it reappears here, as a project, when
  // approved — and the alternative was a proposals section that outlives the
  // feature it describes. Deliberately the same rule for a rejection as for a
  // pending one, rather than a second branch that treats them differently.
  //
  // Not paginated with the projects below, and deliberately not sharing their
  // numbering either — see the ordinals TODO.
  const isMine = (p: { creatorId: string }) =>
    myId !== undefined && p.creatorId === myId
  const isUndecidedOrRefused = (s: number) =>
    s === ProjectStatus.PROJECT_STATUS_PROPOSED ||
    s === ProjectStatus.PROJECT_STATUS_REJECTED

  const myProposals = takesProposals
    ? hackathon.projects
        .filter((p) => isMine(p) && isUndecidedOrRefused(p.status))
        .sort(
          (a, b) =>
            (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
        )
    : []

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
    isPreferred: preferredIds.has(p.id),
  }))

  // No `mayEdit` on the rows above, and it is per-row here: editing is offered on
  // a proposal awaiting review and nowhere else. That used to be true of this
  // whole group by construction; now that it also holds rejected rows it has to
  // be said per row, because `projectEditData` refuses a rejected project to its
  // proposer ("This project has been reviewed — only an organizer can edit it
  // now"), and a row must not offer a link that answers 403. A rejected proposal
  // becomes editable again if the organiser reconsiders it, which returns it to
  // PROPOSED.
  //
  // Once a project is approved it is the hackathon's, and the owner edits it from
  // Manage Projects — the proposer no longer does.
  const proposals = myProposals.map((p, i) => ({
    id: p.id,
    num: myProposals.length - i,
    title: p.title,
    description: p.description,
    creator: memberNames.get(p.creatorId),
    track: p.trackId ? trackNames.get(p.trackId) : undefined,
    imageUrl: p.image,
    status: p.status,
    mayEdit: p.status === ProjectStatus.PROJECT_STATUS_PROPOSED,
  }))

  // `hackathonId` so the page can build the link to a project —
  // unresolved, since `resolve()` belongs at the anchor itself.
  return {
    projects,
    proposals,
    hackathonId: hackathon.id,
    mayPrefer,
    takesProposals,
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
