import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The organizer cockpit. Everything here was API-only until now: approving
// participants, publishing event pages and handing out invitation links all
// required grpcurl.
//
// The backend stays authoritative — every RPC below runs its own casbin check
// — so this route only surfaces the controls and translates the verdicts.

/** Maps a gRPC failure onto a form error, rethrowing anything unexpected. */
function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only the event's organizers can do that." })
    if (e.code === Status.UNAUTHENTICATED)
      return fail(401, { message: "Please sign in again." })
    if (e.code === Status.NOT_FOUND) return fail(404, { message: "That item no longer exists." })
    if (e.code === Status.ALREADY_EXISTS)
      return fail(409, { message: "That already exists." })
    if (e.code === Status.FAILED_PRECONDITION)
      return fail(409, { message: e.details || "That isn't possible right now." })
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details || "Invalid input." })
  }
  throw e
}

// Capability enum: REGISTER=1, PROPOSE_PROJECTS=2, SET_TEAM_PREFERENCES=3,
// CREATE_PROJECT_SUBMISSIONS=4, VOTE=5, VIEW_RESULTS=6
const CAPABILITY_LABEL: Partial<Record<number, string>> = {
  1: "Registration",
  2: "Project proposals",
  3: "Team preferences",
  4: "Submissions",
  5: "Voting",
  6: "Results",
}

// CapabilityState: COMING=1, OPEN=2, CLOSED=3, UNGOVERNED=4
const CAPABILITY_STATE_LABEL: Partial<Record<number, string>> = {
  1: "Opens later",
  2: "Open",
  3: "Closed",
  4: "Not governed",
}
const CAPABILITY_STATE_PRESET: Partial<Record<number, string>> = {
  1: "preset-tonal-warning",
  2: "preset-tonal-success",
  3: "preset-tonal-error",
  4: "preset-outlined-surface-200-800",
}

// SubmissionStatus: DRAFT=1, FINAL=2
const SUBMISSION_STATUS_LABEL: Partial<Record<number, string>> = {
  1: "draft",
  2: "final",
}

/** Blank means "leave this one alone", so it must not reach the RPC at all. */
function optionalText(form: FormData, key: string): string | undefined {
  const v = String(form.get(key) ?? "").trim()

  return v === "" ? undefined : v
}

function optionalTime(form: FormData, key: string): Date | undefined {
  const v = optionalText(form, key)
  if (!v) return undefined
  const d = new Date(v)

  return Number.isNaN(d.getTime()) ? undefined : d
}

export const load: PageServerLoad = async (event) => {
  const { hackathon, team } = requireGrpc(event.locals.grpc)
  const hackathonId = event.params.id

  let full
  try {
    full = await hackathon.get({ hackathonId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "You are not a member of this hackathon")
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) error(404, "Hackathon not found")
    throw e
  }
  if (!full.hackathon) error(404, "Hackathon not found")

  // Invitation links carry live secrets, so ListInvites requires hackathon
  // write. A member who is not an organizer simply gets no invite panel
  // rather than an error page.
  let invites: {
    id: string
    token: string
    note: string
    createdAt?: Date
  }[] = []
  let isOrganizer = true
  try {
    const res = await hackathon.listInvites({ hackathonId })
    invites = res.invites.map((i) => ({
      id: i.id,
      token: i.token,
      note: i.note,
      createdAt: i.createdAt,
    }))
  } catch (e) {
    if (
      e instanceof ClientError &&
      (e.code === Status.PERMISSION_DENIED || e.code === Status.UNAUTHENTICATED)
    ) {
      isOrganizer = false
    } else {
      throw e
    }
  }

  // Awards point at submissions by id, and there is no per-hackathon submission
  // listing — teams carry them one team at a time.
  let submissions: { id: string; label: string }[] = []
  if (isOrganizer) {
    try {
      const { teams } = await team.list({ hackathonId })
      const perTeam = await Promise.all(
        teams.map(async (t) => {
          const res = await team.listSubmissions({ teamId: t.id })

          return res.submissions.map((s) => ({
            id: s.id,
            label: `${t.name} · v${s.version} (${SUBMISSION_STATUS_LABEL[s.status] ?? "unknown"})`,
          }))
        }),
      )
      submissions = perTeam.flat()
    } catch (e) {
      if (
        !(
          e instanceof ClientError &&
          (e.code === Status.PERMISSION_DENIED || e.code === Status.NOT_FOUND)
        )
      ) {
        throw e
      }
    }
  }

  const phases = [...full.hackathon.phases].sort((a, b) => {
    // Undated phases sort last rather than to the epoch.
    const ta = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER
    const tb = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER

    return ta - tb
  })

  return {
    hackathon: full.hackathon,
    members: full.hackathon.members,
    pages: full.hackathon.pages,
    phases,
    tracks: full.hackathon.tracks,
    settings: full.hackathon.settings,
    currentPhaseId: full.hackathon.currentPhaseId ?? "",
    capabilities: full.hackathon.capabilities.map((c) => ({
      capability: c.capability,
      label: CAPABILITY_LABEL[c.capability] ?? "Unknown",
      state: c.state,
      stateLabel: CAPABILITY_STATE_LABEL[c.state] ?? "Unknown",
      statePreset: CAPABILITY_STATE_PRESET[c.state] ?? "preset-tonal",
      openInPhaseId: c.openInPhaseId ?? "",
      closedInPhaseId: c.closedInPhaseId ?? "",
      opensAt: c.opensAt ?? null,
      closesAt: c.closesAt ?? null,
    })),
    submissions,
    invites,
    isOrganizer,
  }
}

export const actions: Actions = {
  approve: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const userId = String(form.get("userId") ?? "")
    if (!userId) return fail(400, { message: "Missing participant." })
    try {
      await hackathon.approveParticipant({ hackathonId: event.params.id, userId })
    } catch (e) {
      return formError(e)
    }

    return { approved: userId }
  },

  remove: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const userId = String(form.get("userId") ?? "")
    if (!userId) return fail(400, { message: "Missing participant." })
    try {
      await hackathon.removeParticipant({ hackathonId: event.params.id, userId })
    } catch (e) {
      return formError(e)
    }

    return { removed: userId }
  },

  createInvite: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    try {
      await hackathon.createInvite({
        hackathonId: event.params.id,
        note: String(form.get("note") ?? ""),
      })
    } catch (e) {
      return formError(e)
    }

    return { inviteCreated: true }
  },

  revokeInvite: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const inviteId = String(form.get("inviteId") ?? "")
    if (!inviteId) return fail(400, { message: "Missing invite." })
    try {
      await hackathon.revokeInvite({ inviteId })
    } catch (e) {
      return formError(e)
    }

    return { inviteRevoked: inviteId }
  },

  createPage: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const title = String(form.get("title") ?? "").trim()
    if (!title) return fail(400, { message: "A page needs a title." })
    try {
      // `order` is assigned by the backend (max+1); reordering is a separate
      // MoveUp/MoveDown/SetOrder concern.
      await page.create({
        hackathonId: event.params.id,
        title,
        content: String(form.get("content") ?? ""),
        visible: form.get("visible") === "on",
      })
    } catch (e) {
      return formError(e)
    }

    return { pageCreated: title }
  },

  editPage: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const pageId = String(form.get("pageId") ?? "")
    if (!pageId) return fail(400, { message: "Missing page." })
    try {
      await page.edit({
        pageId,
        title: String(form.get("title") ?? ""),
        content: String(form.get("content") ?? ""),
        // An unchecked checkbox submits nothing, so absence means "hide".
        visible: form.get("visible") === "on",
      })
    } catch (e) {
      return formError(e)
    }

    return { pageEdited: pageId }
  },

  deletePage: async (event) => {
    const { page } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const pageId = String(form.get("pageId") ?? "")
    if (!pageId) return fail(400, { message: "Missing page." })
    try {
      await page.delete({ pageId })
    } catch (e) {
      return formError(e)
    }

    return { pageDeleted: pageId }
  },

  createPhase: async (event) => {
    const { phase } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const name = String(form.get("name") ?? "").trim()
    if (!name) return fail(400, { message: "A phase needs a name." })
    try {
      await phase.create({
        hackathonId: event.params.id,
        name,
        description: String(form.get("description") ?? "").trim(),
        startsAt: optionalTime(form, "startsAt"),
        endsAt: optionalTime(form, "endsAt"),
        pageId: optionalText(form, "pageId"),
      })
    } catch (e) {
      return formError(e)
    }

    return { phaseCreated: name }
  },

  editPhase: async (event) => {
    const { phase } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const phaseId = String(form.get("phaseId") ?? "")
    if (!phaseId) return fail(400, { message: "Missing phase." })
    try {
      await phase.edit({
        phaseId,
        name: optionalText(form, "name"),
        description: optionalText(form, "description"),
        startsAt: optionalTime(form, "startsAt"),
        endsAt: optionalTime(form, "endsAt"),
        // "" unlinks the page, a uuid links it; sending nothing leaves it as is.
        pageId: String(form.get("pageId") ?? ""),
      })
    } catch (e) {
      return formError(e)
    }

    return { phaseEdited: phaseId }
  },

  deletePhase: async (event) => {
    const { phase } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const phaseId = String(form.get("phaseId") ?? "")
    if (!phaseId) return fail(400, { message: "Missing phase." })
    try {
      await phase.delete({ phaseId })
    } catch (e) {
      return formError(e)
    }

    return { phaseDeleted: phaseId }
  },

  advancePhase: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const phaseId = String(form.get("phaseId") ?? "")
    if (!phaseId) return fail(400, { message: "Missing phase." })
    try {
      await hackathon.advancePhase({ hackathonId: event.params.id, phaseId })
    } catch (e) {
      return formError(e)
    }

    return { phaseAdvanced: phaseId }
  },

  createTrack: async (event) => {
    const { track } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const name = String(form.get("name") ?? "").trim()
    if (!name) return fail(400, { message: "A track needs a name." })
    try {
      await track.create({
        hackathonId: event.params.id,
        name,
        description: String(form.get("description") ?? "").trim(),
      })
    } catch (e) {
      return formError(e)
    }

    return { trackCreated: name }
  },

  editTrack: async (event) => {
    const { track } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const trackId = String(form.get("trackId") ?? "")
    if (!trackId) return fail(400, { message: "Missing track." })
    try {
      await track.edit({
        trackId,
        name: optionalText(form, "name"),
        description: optionalText(form, "description"),
      })
    } catch (e) {
      return formError(e)
    }

    return { trackEdited: trackId }
  },

  deleteTrack: async (event) => {
    const { track } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const trackId = String(form.get("trackId") ?? "")
    if (!trackId) return fail(400, { message: "Missing track." })
    try {
      await track.delete({ trackId })
    } catch (e) {
      return formError(e)
    }

    return { trackDeleted: trackId }
  },

  setPrizes: async (event) => {
    const { prize } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const ranks = form.getAll("rank")
    const titles = form.getAll("title")
    const prizes: { rank: number; title: string }[] = []
    for (let i = 0; i < titles.length; i++) {
      const title = String(titles[i] ?? "").trim()
      if (!title) continue
      prizes.push({ rank: Number(ranks[i] ?? 0) || 0, title })
    }
    if (prizes.length === 0) return fail(400, { message: "Add at least one prize." })
    let result
    try {
      // Set replaces the whole table, so the form always submits every row.
      result = await prize.set({ hackathonId: event.params.id, prizes })
    } catch (e) {
      return formError(e)
    }

    return { prizes: result.prizes }
  },

  editPrize: async (event) => {
    const { prize } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const title = String(form.get("title") ?? "").trim()
    if (!title) return fail(400, { message: "A prize needs a title." })
    try {
      await prize.edit({
        hackathonId: event.params.id,
        rank: Number(form.get("rank") ?? 0) || 0,
        title,
      })
    } catch (e) {
      return formError(e)
    }

    return { prizeEdited: title }
  },

  finalizePrizes: async (event) => {
    const { prize } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const ranks = form.getAll("awardRank")
    const specials = form.getAll("awardSpecial")
    const submissionIds = form.getAll("awardSubmission")
    const awards: { rank?: number; special?: string; submissionId: string }[] = []
    for (let i = 0; i < submissionIds.length; i++) {
      const submissionId = String(submissionIds[i] ?? "")
      if (!submissionId) continue
      const special = String(specials[i] ?? "").trim()
      const rank = String(ranks[i] ?? "").trim()
      if (special) awards.push({ special, submissionId })
      else if (rank) awards.push({ rank: Number(rank), submissionId })
    }
    if (awards.length === 0) return fail(400, { message: "Pick at least one winner." })
    try {
      await prize.finalize({ hackathonId: event.params.id, awards })
    } catch (e) {
      return formError(e)
    }

    return { finalized: awards.length }
  },

  setWindows: async (event) => {
    const { config } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    let result
    try {
      result = await config.setWindows({
        hackathonId: event.params.id,
        registrationOpens: optionalTime(form, "registrationOpens"),
        registrationCloses: optionalTime(form, "registrationCloses"),
        proposalsClose: optionalTime(form, "proposalsClose"),
        preferencesClose: optionalTime(form, "preferencesClose"),
        submissionsClose: optionalTime(form, "submissionsClose"),
        latePolicy: optionalText(form, "latePolicy"),
      })
    } catch (e) {
      return formError(e)
    }

    return { windows: result.windows }
  },

  overrideWindow: async (event) => {
    const { config } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const minutes = Number(form.get("extendMinutes") ?? 0)
    if (!minutes || minutes < 1) return fail(400, { message: "Say how many minutes to add." })
    let result
    try {
      result = await config.overrideWindow({
        hackathonId: event.params.id,
        window: String(form.get("window") ?? ""),
        extendMinutes: minutes,
        reason: String(form.get("reason") ?? ""),
      })
    } catch (e) {
      return formError(e)
    }

    return { windows: result.windows, overrode: true }
  },

  editEvent: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const visibility = Number(form.get("visibility") ?? 0)
    try {
      await hackathon.edit({
        hackathonId: event.params.id,
        name: optionalText(form, "name"),
        // Unlike the other fields, an emptied description is a real edit.
        description: String(form.get("description") ?? ""),
        visibility: visibility || undefined,
        startsAt: optionalTime(form, "startsAt"),
        endsAt: optionalTime(form, "endsAt"),
      })
    } catch (e) {
      return formError(e)
    }

    return { eventEdited: true }
  },

  editSettings: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    try {
      await hackathon.editSettings({
        hackathonId: event.params.id,
        registrationsEnabled: form.get("registrationsEnabled") === "on",
        votingEnabled: form.get("votingEnabled") === "on",
      })
    } catch (e) {
      return formError(e)
    }

    return { settingsEdited: true }
  },

  editCapability: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const capability = Number(form.get("capability") ?? 0)
    if (!capability) return fail(400, { message: "Missing capability." })
    const enabled = form.get("enabled")
    try {
      await hackathon.editCapability({
        hackathonId: event.params.id,
        capability,
        // Only the clicked button carries `enabled`; saving the schedule alone
        // must not open or close anything.
        enabled: enabled === null ? undefined : enabled === "true",
        openInPhaseId: form.has("openInPhaseId")
          ? String(form.get("openInPhaseId") ?? "")
          : undefined,
        closedInPhaseId: form.has("closedInPhaseId")
          ? String(form.get("closedInPhaseId") ?? "")
          : undefined,
      })
    } catch (e) {
      return formError(e)
    }

    return { capabilityEdited: capability }
  },
}
