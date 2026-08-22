import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import type { AuthorizedGrpc } from "$lib/server/grpc/client"
import type { Hackathon } from "$lib/server/grpc/generated/hackathon/entities/hackathon"
import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"
import type { User } from "$lib/server/grpc/generated/user/entities/user"

/**
 * Server-only: the load gate and save action behind the project edit route.
 *
 * One route, `projects/[projectId]/edit`, reached from the project's own page
 * and from the proposals group on the Projects page. It used to be two — a
 * second copy under `projects/proposals/` existed only to send the editor back
 * to the proposals list — and they collapsed into one when that list did. The
 * gate and the save still live here rather than in the route, since both are
 * about the project rather than about where the editor came from.
 */

/**
 * The project to edit, plus the tracks the form offers.
 *
 * Throws 404 if the project is not in this hackathon, and 403 unless the viewer
 * is one of two subjects:
 *
 *  - the **hackathon owner or an admin**, at any status. They hold
 *    `project:write` across the hackathon (`rbac.go:190`, plus the casbin escape
 *    hatch), and an approved project is theirs to correct — Manage Projects is
 *    where they are offered it.
 *  - the **proposer, while the proposal is still awaiting review**. Their claim
 *    is the project-scoped Owner role `Propose` granted them
 *    (`project_service.go:218`), and it exists so they can correct what they put
 *    forward before it is judged. Once approved, the project belongs to the
 *    hackathon rather than to them.
 *
 * Refused up front rather than after a form is filled in.
 */
export function projectEditData(
  hackathon: Hackathon,
  projectId: string,
  myMembership: HackathonMember | null,
  platformUser: User | undefined,
) {
  const project = hackathon.projects.find((p) => p.id === projectId)
  if (!project) {
    error(404, "Project not found")
  }

  const isCreator = project.creatorId === platformUser?.id
  const isHackathonOwner =
    myMembership?.role === HackathonRole.HACKATHON_ROLE_OWNER
  const isAdmin = (platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // TODO(backend: proposer-edit-after-approval): the status half of this rule is
  // the frontend's alone. `ProjectService.Edit` and `Delete` accept the
  // proposer's project-scoped Owner role at *any* status
  // (`project_service.go:562-575`, `:674-687`), so a proposer who types this URL
  // still edits their approved project and the backend allows it. Drop the
  // `isOpenProposal` check here once the handlers enforce it, and the gate goes
  // back to mirroring them exactly.
  const isOpenProposal =
    project.status === ProjectStatus.PROJECT_STATUS_PROPOSED

  if (!isHackathonOwner && !isAdmin) {
    if (!isCreator) {
      // Says what the rule is, not who the proposer is: an owner and an admin
      // pass this too, so "only the proposer may edit" would be false.
      error(403, "You don't have permission to edit this project")
    }
    if (!isOpenProposal) {
      // A different sentence from the one above on purpose: this viewer *did*
      // propose it, and what changed is the project's status, not their standing.
      error(
        403,
        "This project has been reviewed — only an organizer can edit it now",
      )
    }
  }

  return {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      trackId: project.trackId,
      image: project.image,
      status: project.status,
    },
    tracks: hackathon.tracks.map((t) => ({ id: t.id, name: t.name })),
    hackathonId: hackathon.id,
  }
}

/**
 * Validate the submitted form and call `ProjectService.Edit`.
 *
 * Returns an `ActionFailure` to hand straight back from the action, or
 * `undefined` on success — at which point the caller redirects wherever it
 * wants the editor to land.
 */
export async function saveProjectEdit(
  grpc: AuthorizedGrpc,
  projectId: string,
  form: FormData,
) {
  const title = form.get("title")
  const description = form.get("description")
  const trackId = form.get("trackId")
  const image = form.get("image")

  if (typeof title !== "string" || title.trim().length < 3) {
    return fail(400, { message: "Title must be at least 3 characters" })
  }
  if (title.trim().length > 255) {
    return fail(400, { message: "Title must be at most 255 characters" })
  }
  // TODO(backend: project-edit-clear-fields): `EditRequest.description` has
  // `min_len = 1` while `ProposeRequest.description` has no minimum, so a
  // description can be left out at proposal time but never emptied — or even
  // saved as-is — afterwards. Until the minimum is dropped, this is a required
  // field on edit and the message says so. Once it lands, drop this check and
  // pass the empty string through.
  if (typeof description !== "string" || description.trim() === "") {
    return fail(400, {
      message:
        "A description is required — the backend rejects an empty one when editing",
    })
  }
  if (description.length > 10000) {
    return fail(400, {
      message: "Description must be at most 10000 characters",
    })
  }

  try {
    await grpc.project.edit({
      projectId,
      title: title.trim(),
      description,
      // TODO(backend: project-edit-clear-fields): `Edit` applies `track_id` only
      // when non-empty, so a track can be set and changed but never removed.
      // The form therefore drops "No track" once a track is set, rather than
      // offering a control that silently does nothing. Once the handler
      // distinguishes unset from empty, restore the option here and in the form.
      trackId:
        typeof trackId === "string" && trackId !== "" ? trackId : undefined,
      // Unlike track, an empty image does clear: `Edit` tests `req.Image` for
      // nil, not for "".
      image: typeof image === "string" ? image.trim() : "",
    })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
      return fail(400, { message: e.details })
    }
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      return fail(403, {
        message: "You don't have permission to edit this project",
      })
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      return fail(404, { message: "This project no longer exists" })
    }
    throw e
  }

  return undefined
}
