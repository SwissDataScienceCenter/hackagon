import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { SubmissionStatus } from "$lib/server/grpc/generated/hackathon/entities/submission_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayCreateSubmissions } from "$lib/server/hackathon/capabilities"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )

  const submissionsEnabled =
    hackathon.state?.capabilities.find(
      (c) => c.capability === Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
    )?.enabled ?? false

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

      const byVersion = [...submissions].sort((a, b) => a.version - b.version)
      const views = byVersion.map((s) => ({
        id: s.id,
        version: s.version,
        status: s.status,
        result: s.result,
        createdAt: s.createdAt,
        modifiedAt: s.modifiedAt,
        creator: memberNames.get(s.creatorId),
      }))

      return {
        teamId: t.id,
        teamName: t.name,
        projectId: t.projectId,
        projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
        // Highest version is the one that counts for "what's newest" — it can
        // be a draft sitting on top of an older final version, so it is shown
        // separately from the latest *final* one rather than in its place.
        latest: views.length > 0 ? views[views.length - 1]! : null,
        latestFinal:
          [...views]
            .reverse()
            .find(
              (v) => v.status === SubmissionStatus.SUBMISSION_STATUS_FINAL,
            ) ?? null,
        // Superseded versions, newest first.
        earlier: views.slice(0, -1).reverse(),
        maySubmit: mayCreateSubmissions(
          myMembership ?? undefined,
          submissionsEnabled,
          isAdmin,
        ),
      }
    }),
  )

  return { groups }
}

export const actions: Actions = {
  createSubmission: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const teamId = form.get("teamId")
    const projectId = form.get("projectId")
    const result = form.get("result")
    if (typeof teamId !== "string" || teamId === "") {
      return fail(400, { message: "Missing team" })
    }
    if (typeof projectId !== "string" || projectId === "") {
      return fail(400, { message: "Missing project" })
    }
    if (typeof result !== "string") {
      return fail(400, { message: "Missing result" })
    }

    try {
      await team.createSubmission({
        teamId,
        projectId,
        result: result.trim() === "" ? undefined : result.trim(),
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to submit for this team",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team or project not found" })
      }
      throw e
    }

    return { success: true }
  },

  finalizeSubmission: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const submissionId = form.get("submissionId")
    if (typeof submissionId !== "string" || submissionId === "") {
      return fail(400, { message: "Missing submission" })
    }

    try {
      await team.finalizeSubmission({ submissionId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to finalize this submission",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Submission not found" })
      }
      throw e
    }

    return { success: true }
  },
}
