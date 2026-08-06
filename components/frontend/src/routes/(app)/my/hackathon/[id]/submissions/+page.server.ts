import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// Turning work in.
//
// The read half survived the design swap; the write half did not, and nothing
// flagged it because the route still existed. CreateSubmission, EditSubmission
// and FinalizeSubmission had no caller anywhere in the frontend — the one step
// the whole event builds towards was grpcurl-only again.
//
// A submission belongs to a TEAM, so the controls appear only on teams the
// viewer is on. The backend enforces that with a team-scoped casbin domain
// regardless, plus the submissions window and the submissions capability; this
// only decides what to draw.

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
    // A closed submissions window and an already-finalised submission both land
    // here. Left generic it reads as a refusal, so name the clock explicitly.
    if (e.code === Status.FAILED_PRECONDITION)
      return fail(409, {
        message: `${e.details || "That isn't possible right now."} — this is a deadline, not a permission problem. An organiser can reopen or extend it.`,
      })
    if (e.code === Status.ABORTED)
      return fail(409, {
        message: e.details || "Something changed underneath — try again.",
      })
    // The organiser's submission schema validates here, and the details name
    // the exact field that is missing or unknown, which is the useful part.
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details || "Invalid input." })
  }
  throw e
}

/** Capability: CREATE_PROJECT_SUBMISSIONS=4 */
const CAP_SUBMISSIONS = 4

/**
 * Turns the server-computed capability row into a gate the page can narrate.
 *
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
 * Reads the answers back off the form.
 *
 * Keys come from the organiser's schema when there is one — it rides on the
 * hackathon entity, so the page can render real labelled fields — and from a
 * parallel key/value editor when there is not. Either way the backend has the
 * last word: unknown or missing keys come back as INVALID_ARGUMENT naming the
 * field.
 */
function answerMap(form: FormData): Record<string, string> {
  const answers: Record<string, string> = {}

  for (const [name, value] of form.entries()) {
    if (!name.startsWith("field:")) continue
    const key = name.slice(6).trim()
    if (key) answers[key] = String(value).trim()
  }

  const keys = form.getAll("answerKey")
  const values = form.getAll("answerValue")
  for (let i = 0; i < keys.length; i++) {
    const key = String(keys[i] ?? "").trim()
    if (key) answers[key] = String(values[i] ?? "").trim()
  }

  return answers
}

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const { teams } = await team.list({ hackathonId: event.params.id })

  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  // EVERY team's submissions, not only the viewer's own.
  //
  // A pinned policy: members read all submissions hackathon-wide. The whole
  // room watching what the room built is most of what this page is for on the
  // final day, and the vote is cast on exactly these. Narrowing it to your own
  // teams — which is how it arrived in the design swap — leaves a participant
  // on one team seeing one card.
  //
  // What stays scoped is WRITING: `isMine` gates the controls, and the backend
  // enforces it with a team-scoped casbin domain regardless.
  const groups = await Promise.all(
    teams.map(async (t) => {
      // ListSubmissions rather than the submissions nested in `team.list`: the
      // nested ones carry no ordering guarantee, and "which version counts"
      // depends entirely on order.
      //
      // One team denying must cost that team's card, not the page: a policy
      // change could make a single team unreadable.
      const { submissions } = await team
        .listSubmissions({ teamId: t.id })
        .catch(() => ({ submissions: [] }))

      const byVersion = [...submissions].sort((a, b) => a.version - b.version)
      const views = byVersion.map((s) => ({
        id: s.id,
        version: s.version,
        status: s.status,
        result: s.result,
        createdAt: s.createdAt,
        modifiedAt: s.modifiedAt,
      }))

      return {
        teamId: t.id,
        teamName: t.name,
        projectId: t.projectId,
        projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
        isMine: t.members.some((m) => m.id === platformUserId),
        // Highest version is the one that counts; null when the team has none.
        latest: views.length > 0 ? views[views.length - 1]! : null,
        // Superseded versions, newest first.
        earlier: views.slice(0, -1).reverse(),
      }
    }),
  )

  return {
    groups,
    // What the organiser asks a submission to carry. Absent means "anything
    // goes" — the backend reads an unset schema the same way.
    submissionFields: hackathon.submissionForm?.fields ?? [],
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
      // Only `result` is editable; the structured answers are fixed at create,
      // and a new version is how you change them.
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
