import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayCreateSubmissions } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import {
  parseSubmissionForm,
  sameSubmission,
} from "$lib/server/hackathon/submissionForm"
import { submissionEntry } from "$lib/server/hackathon/submissions"
import { listVisibleTeams } from "$lib/server/hackathon/teams"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The viewer's own team's entry, edited in place — the page behind the
// sidebar's Our submission entry. Every team's entry, read only, is the
// Submissions page one level up.
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

  // Undefined when team assignments are not published, which takes this page
  // with it: submissions hang off a team, and `TeamService.List` needs
  // `team:read`. A participant cannot reach their *own* team's work without it —
  // see `TODO(backend: submissions-need-view-teams)` below. Refusing loudly
  // would be a 500 on a core participant page, so the page renders and says
  // what is missing.
  const visibleTeams = await listVisibleTeams(team, event.params.id)

  // Every team the viewer is on, not just the first — nothing stops a
  // participant from being assigned to more than one team in one hackathon, and
  // each carries its own submission.
  const myTeams = (visibleTeams ?? []).filter((t) =>
    t.members.some((m) => m.id === platformUserId),
  )

  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  // Who saved comes back as a bare user id — resolved against every confirmed
  // hackathon member, not just the team's current roster, since the person who
  // saved may since have left the team. Same fallback as the overview page: a
  // member who has left resolves to nothing.
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
        entry: submissionEntry(submissions, memberNames),
      }
    }),
  )

  return {
    groups,
    // TODO(backend: submissions-need-view-teams): false hides the whole page
    // behind an explanation. `CAPABILITY_CREATE_PROJECT_SUBMISSIONS` grants
    // `submission:create` and nothing else (`hackathon_service.go:1019`), so an
    // organiser who opens submissions without publishing team assignments leaves
    // every participant unable to see or file any — the capability that is
    // supposed to open this page cannot open it alone. Either that capability
    // should carry a team read, or `ListSubmissions` should take a team id the
    // caller already knows.
    teamsPublished: visibleTeams !== undefined,
    // Viewer-wide, not per-team: the RPC's permission does not depend on which
    // of the viewer's teams it is.
    maySubmit: mayCreateSubmissions(
      myMembership ?? undefined,
      submissionsEnabled,
      isAdmin,
    ),
  }
}

export const actions: Actions = {
  // One save is two RPCs: `CreateSubmission` always writes a new draft
  // version, and `FinalizeSubmission` makes it the team's entry. Doing both
  // every time is what lets the page treat the submission as one thing edited
  // in place — see `submissionEntry`.
  //
  // TODO(backend: submission-edit-in-place): with an update RPC this becomes a
  // single call. Until then, a save while voting is open moves the entry onto a
  // new version id, while the votes already cast stay on the old one: the same
  // voter can vote for the team again, and results can show "Unknown
  // submission". Not locked here on purpose — where the backend allows an edit,
  // so does the frontend.
  saveSubmission: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const teamId = form.get("teamId")
    const projectId = form.get("projectId")
    if (typeof teamId !== "string" || teamId === "") {
      return fail(400, { teamId: null, message: "Missing team" })
    }
    if (typeof projectId !== "string" || projectId === "") {
      return fail(400, { teamId, message: "Missing project" })
    }

    const parsed = parseSubmissionForm(form)
    if (!parsed.ok) {
      return fail(400, { teamId, message: parsed.message })
    }
    const { repositoryUrl, attachmentFolderUrl, description } = parsed.values

    let id
    try {
      // Compared against the entry as it is now, read fresh rather than sent
      // with the form: a teammate may have saved since this page loaded.
      const { submissions } = await team.listSubmissions({ teamId })
      if (
        sameSubmission(submissionEntry(submissions, new Map()), parsed.values)
      ) {
        return { success: true, teamId, unchanged: true }
      }

      ;({ id } = await team.createSubmission({
        teamId,
        projectId,
        // TODO(backend: submission-repository-url): see `submissionEntry`.
        result: repositoryUrl,
        attachmentFolderUrl,
        description,
      }))
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

    // The content is stored by now, as a draft the team's entry ignores. The
    // next save repairs it: the draft differs from the entry, so that save is
    // not skipped as unchanged.
    try {
      await team.finalizeSubmission({ submissionId: id })
    } catch (e) {
      if (e instanceof ClientError) {
        return fail(500, {
          teamId,
          message: "Saved, but not yet your team's entry — save again",
        })
      }
      throw e
    }

    return { success: true, teamId, unchanged: false }
  },
}
