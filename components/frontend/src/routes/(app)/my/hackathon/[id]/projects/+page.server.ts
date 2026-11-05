import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayPreferProjects } from "$lib/server/hackathon/capabilities"
import { namesByUserId } from "$lib/server/hackathon/membership"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import { markdownExcerpt } from "$lib/utils/markdown"
import { PROJECT_EXCERPT_CHARS } from "$lib/utils/projectExcerpt"

// No owner/admin check here: reviewing proposals is an organiser action and
// lives under Manage Projects, which gates itself (see $lib/navigation's
// manageNav) and owns every decision — Approve, Revoke and Reconsider on the
// queue, Reject on a project's own page. This page is the participant view and
// reads the same for everyone.
export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // project at every status.
  const { hackathon, myMembership, myProjectCount, proposalsOpen } =
    await event.parent()

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
  // decision is not yet one of them — it belongs to its author, who reads it on
  // My projects at every status, and to the reviewer, who sees every status on
  // Manage Projects. So this list reads identically for a member and an owner, which is
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

  // Whether the header points at My projects, where the viewer's own proposals
  // and the Propose button now live. The same two facts that offer that page in
  // the sidebar (see `memberNav`), so the link never leads somewhere the menu
  // does not list. A proposer whose project is pending or was turned down
  // looks here first; the link is how they find it is not lost.
  const showMineLink = myProjectCount > 0 || proposalsOpen

  // `Project` carries only `creatorId`, so the name comes from the people the
  // same response already named — members and owners, so an organiser who
  // proposed without joining is named too. A creator who has since left
  // resolves to nothing, and the card says "Unknown author" rather than
  // printing a raw uuid at someone.
  const names = namesByUserId(hackathon.members, hackathon.owners)

  // Tracks arrive nested in the same response. A project whose track was
  // deleted resolves to nothing and the card omits it.
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  const projects = ordered.map((p) => ({
    id: p.id,
    title: p.title,
    excerpt: markdownExcerpt(p.description, PROJECT_EXCERPT_CHARS),
    creator: names.get(p.creatorId),
    track: p.trackId ? trackNames.get(p.trackId) : undefined,
    imageUrl: p.image,
    status: p.status,
    isPreferred: preferredIds.has(p.id),
  }))

  // `hackathonId` so the page can build the link to a project —
  // unresolved, since `resolve()` belongs at the anchor itself.
  return {
    projects,
    hackathonId: hackathon.id,
    mayPrefer,
    showMineLink,
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
