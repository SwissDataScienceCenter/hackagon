import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import {
  mayCreateSubmissions,
  mayFinalizeSubmissions,
} from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { submissionVersions } from "$lib/server/hackathon/submissions"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )

  const submissionsEnabled = enabledCapabilities(hackathon.state).includes(
    Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
  )

  const { teams } = await team.list({ hackathonId: event.params.id })

  // Every team the viewer is on, not just the first — nothing stops a
  // participant from being assigned to more than one team in one hackathon, and
  // each carries its own submissions.
  const myTeams = teams.filter((t) =>
    t.members.some((m) => m.id === platformUserId),
  )

  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  // Creator/modifier come back as bare user ids — resolved against every
  // confirmed hackathon member, not just the team's current roster, since the
  // person who created a submission may since have left the team. Same
  // fallback as the overview page: a creator who has left resolves to nothing.
  const memberNames = new Map(
    hackathon.members
      .filter((m) => m.user !== undefined)
      .map((m) => [m.user!.id, m.user!.displayName || m.user!.username]),
  )

  const groups = await Promise.all(
    myTeams.map(async (t) => {
      // ListSubmissions rather than the submissions nested in `team.list`: the
      // nested ones carry no ordering guarantee, and "which version counts"
      // depends entirely on order.
      const { submissions } = await team.listSubmissions({ teamId: t.id })

      return {
        teamId: t.id,
        teamName: t.name,
        projectId: t.projectId,
        projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
        ...submissionVersions(submissions, memberNames),
      }
    }),
  )

  return {
    groups,
    // Both are viewer-wide, not per-team: neither RPC's permission depends on
    // which of the viewer's teams it is.
    maySubmit: mayCreateSubmissions(
      myMembership ?? undefined,
      submissionsEnabled,
      isAdmin,
    ),
    mayFinalize: mayFinalizeSubmissions(myMembership ?? undefined, isAdmin),
  }
}

export const actions: Actions = {
  createSubmission: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const teamId = form.get("teamId")
    const projectId = form.get("projectId")
    const result = form.get("result")
    if (typeof teamId !== "string" || teamId === "") {
      return fail(400, { teamId: null, message: "Missing team" })
    }
    if (typeof projectId !== "string" || projectId === "") {
      return fail(400, { teamId, message: "Missing project" })
    }
    // Version numbers are permanent and monotonic, so an empty submission burns
    // one for nothing. The backend accepts it (`result` is optional), which is
    // why this is checked here rather than relied upon.
    if (typeof result !== "string" || result.trim() === "") {
      return fail(400, {
        teamId,
        message: "Add a link or a note describing your work",
      })
    }

    try {
      await team.createSubmission({
        teamId,
        projectId,
        result: result.trim(),
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { teamId, message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          teamId,
          message: "You don't have permission to submit for this team",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { teamId, message: "Team or project not found" })
      }
      throw e
    }

    return { success: true }
  },

  finalizeSubmission: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    // Carried only so a failure can be reported on the right team's card.
    const teamId = form.get("teamId")
    const scope = typeof teamId === "string" && teamId !== "" ? teamId : null

    const submissionId = form.get("submissionId")
    if (typeof submissionId !== "string" || submissionId === "") {
      return fail(400, { teamId: scope, message: "Missing submission" })
    }

    try {
      await team.finalizeSubmission({ submissionId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          teamId: scope,
          message: "You don't have permission to finalize this submission",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { teamId: scope, message: "Submission not found" })
      }
      throw e
    }

    return { success: true }
  },
}
