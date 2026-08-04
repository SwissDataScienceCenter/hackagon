import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// Turning work in was grpcurl-only until now. A submission belongs to a team,
// so the write controls appear only on the teams the viewer is in — the
// backend enforces that with a team-scoped casbin domain regardless, plus the
// submissions window and the submissions capability.

/** Maps a gRPC failure onto a form error, rethrowing anything unexpected. */
function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only this team's members can do that." })
    if (e.code === Status.UNAUTHENTICATED)
      return fail(401, { message: "Please sign in again." })
    if (e.code === Status.NOT_FOUND)
      return fail(404, { message: "That item no longer exists." })
    if (e.code === Status.ALREADY_EXISTS)
      return fail(409, { message: "That already exists." })
    // A closed submissions window and a finalized submission both land here.
    // Left generic it reads as a refusal, so name the clock explicitly.
    if (e.code === Status.FAILED_PRECONDITION)
      return fail(409, {
        message: `${e.details || "That isn't possible right now."} — this is a deadline, not a permission problem. An organizer can reopen or extend it.`,
      })
    if (e.code === Status.ABORTED)
      return fail(409, { message: e.details || "Something changed underneath — try again." })
    // The organizer's submission form validates here: the details name the
    // exact field that is missing or unknown, which is the useful part.
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details || "Invalid input." })
  }
  throw e
}

// SubmissionStatus: DRAFT=1, FINAL=2
const STATUS_LABEL: Partial<Record<number, string>> = {
  1: "Draft",
  2: "Final",
}
const STATUS_PRESET: Partial<Record<number, string>> = {
  1: "preset-tonal-warning",
  2: "preset-tonal-success",
}

// Capability: CREATE_PROJECT_SUBMISSIONS=4
const CAP_SUBMISSIONS = 4

/**
 * Turns the server-computed capability row into a gate the page can narrate.
 * CapabilityState: COMING=1, OPEN=2, CLOSED=3, UNGOVERNED=4. UNGOVERNED and a
 * missing row both mean the server has no opinion, so the page behaves exactly
 * as it did before capabilities existed.
 */
function gateFor(
  capabilities: {
    capability: number
    state: number
    opensAt?: Date | undefined
    closesAt?: Date | undefined
  }[],
  capability: number,
) {
  const c = capabilities.find((x) => x.capability === capability)
  const state = c?.state ?? 4

  return {
    open: !c || state === 2 || state === 4 || state === 0,
    state,
    opensAt: c?.opensAt ?? null,
    closesAt: c?.closesAt ?? null,
  }
}

/**
 * Reads the parallel arrays of the answer editor. There is no RPC that returns
 * the organizer's submission schema, so the keys are typed by the participant
 * and the backend's INVALID_ARGUMENT details are what name a wrong one.
 */
function answerMap(form: FormData): Record<string, string> {
  const keys = form.getAll("answerKey")
  const values = form.getAll("answerValue")

  const answers: Record<string, string> = {}
  for (let i = 0; i < keys.length; i++) {
    const key = String(keys[i] ?? "").trim()
    if (!key) continue
    answers[key] = String(values[i] ?? "").trim()
  }

  return answers
}

export const load: PageServerLoad = async (event) => {
  const { team } = requireGrpc(event.locals.grpc)
  const { hackathon, myMembership } = await event.parent()
  const me = event.locals.platformUser?.id ?? ""

  // HackathonRole: UNSPECIFIED=0, OWNER=1, MEMBER=2.
  const isOrganizer = myMembership?.role === 1

  let teams
  try {
    teams = (await team.list({ hackathonId: event.params.id })).teams
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "Access denied")
    if (e instanceof ClientError && e.code === Status.NOT_FOUND)
      error(404, "Hackathon not found")
    throw e
  }

  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  // Members read every team's submissions, but a policy change would make one
  // team deny — that must cost that team's card, not the whole page.
  const perTeam = await Promise.all(
    teams.map(async (t) => {
      const submissions = await team
        .listSubmissions({ teamId: t.id })
        .then((r) => r.submissions)
        .catch((e: unknown) => {
          if (
            e instanceof ClientError &&
            (e.code === Status.PERMISSION_DENIED || e.code === Status.NOT_FOUND)
          ) {
            return []
          }
          throw e
        })

      return {
        id: t.id,
        name: t.name,
        projectId: t.projectId,
        projectTitle: projectTitles.get(t.projectId) ?? "",
        isMine: t.members.some((m) => m.id === me),
        members: t.members.map((m) => m.displayName || m.username),
        submissions: [...submissions]
          .sort((a, b) => b.version - a.version)
          .map((s) => ({
            id: s.id,
            version: s.version,
            status: s.status,
            statusLabel: STATUS_LABEL[s.status] ?? "Unknown",
            statusPreset: STATUS_PRESET[s.status] ?? "preset-tonal",
            result: s.result ?? "",
            modifiedAt: s.modifiedAt ?? null,
          })),
      }
    }),
  )

  return {
    teams: perTeam,
    isOrganizer,
    submissionsGate: gateFor(hackathon.capabilities, CAP_SUBMISSIONS),
  }
}

export const actions: Actions = {
  create: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const teamId = String(form.get("teamId") ?? "")
    const projectId = String(form.get("projectId") ?? "")
    if (!teamId || !projectId)
      return fail(400, { message: "A submission needs a team and its project." })
    try {
      await team.createSubmission({
        teamId,
        projectId,
        result: String(form.get("result") ?? "").trim(),
        form: answerMap(form),
      })
    } catch (e) {
      return formError(e)
    }

    return { created: teamId }
  },

  edit: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const submissionId = String(form.get("submissionId") ?? "")
    if (!submissionId) return fail(400, { message: "Missing submission." })
    try {
      // Only `result` is editable; the structured answers are fixed at create.
      await team.editSubmission({
        submissionId,
        result: String(form.get("result") ?? ""),
      })
    } catch (e) {
      return formError(e)
    }

    return { edited: submissionId }
  },

  finalize: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const submissionId = String(form.get("submissionId") ?? "")
    if (!submissionId) return fail(400, { message: "Missing submission." })
    try {
      await team.finalizeSubmission({ submissionId })
    } catch (e) {
      return formError(e)
    }

    return { finalized: submissionId }
  },
}
