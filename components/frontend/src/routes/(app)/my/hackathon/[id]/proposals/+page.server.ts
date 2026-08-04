import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// Proposing a project, ranking what you want to work on and curating the
// board were all grpcurl-only until now. The backend stays authoritative:
// every action below runs its own casbin check, capability check and deadline
// check, and this route only surfaces the controls and translates verdicts.

/** Maps a gRPC failure onto a form error, rethrowing anything unexpected. */
function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "You aren't allowed to do that." })
    if (e.code === Status.UNAUTHENTICATED)
      return fail(401, { message: "Please sign in again." })
    if (e.code === Status.NOT_FOUND)
      return fail(404, { message: "That item no longer exists." })
    if (e.code === Status.ALREADY_EXISTS)
      return fail(409, { message: "That already exists." })
    // Windows and capabilities both fail here. It reads as a refusal unless we
    // say plainly that it is the clock, not the roster, that said no.
    if (e.code === Status.FAILED_PRECONDITION)
      return fail(409, {
        message: `${e.details || "That isn't possible right now."} — this is a deadline, not a permission problem. An organizer can reopen or extend it.`,
      })
    if (e.code === Status.INVALID_ARGUMENT)
      return fail(400, { message: e.details || "Invalid input." })
  }
  throw e
}

// ProjectStatus: PROPOSED=1, APPROVED=2
const STATUS_LABEL: Partial<Record<number, string>> = {
  1: "Proposed",
  2: "Approved",
}
const STATUS_PRESET: Partial<Record<number, string>> = {
  1: "preset-tonal-warning",
  2: "preset-tonal-success",
}

// Capability: PROPOSE_PROJECTS=2, SET_TEAM_PREFERENCES=3
const CAP_PROPOSE = 2
const CAP_PREFERENCES = 3

type Gate = {
  open: boolean
  state: number
  opensAt: Date | null
  closesAt: Date | null
}

/**
 * Turns a server-computed capability row into a gate the page can narrate.
 * CapabilityState: COMING=1, OPEN=2, CLOSED=3, UNGOVERNED=4. UNGOVERNED and a
 * missing row both mean the server has no opinion, so the page must behave
 * exactly as it did before capabilities existed.
 */
function gateFor(
  capabilities: {
    capability: number
    state: number
    opensAt?: Date | undefined
    closesAt?: Date | undefined
  }[],
  capability: number,
): Gate {
  const c = capabilities.find((x) => x.capability === capability)
  const state = c?.state ?? 4

  return {
    open: !c || state === 2 || state === 4 || state === 0,
    state,
    opensAt: c?.opensAt ?? null,
    closesAt: c?.closesAt ?? null,
  }
}

/** Blank means "leave this one alone", so it must not reach the RPC at all. */
function optionalText(form: FormData, key: string): string | undefined {
  const v = String(form.get(key) ?? "").trim()

  return v === "" ? undefined : v
}

export const load: PageServerLoad = async (event) => {
  const { project } = requireGrpc(event.locals.grpc)
  const { hackathon, myMembership } = await event.parent()
  const me = event.locals.platformUser?.id ?? ""

  // HackathonRole: UNSPECIFIED=0, OWNER=1, MEMBER=2.
  const isOrganizer = myMembership?.role === 1

  // Preferences are readable only through the organizer-only export, so a
  // plain member cannot be shown their own marks — they get the board without
  // counts rather than an error page.
  let preferenceCounts: Record<string, number> = {}
  let myPreferences: string[] = []
  let canExport = false
  if (isOrganizer) {
    try {
      const res = await project.exportPreferences({ hackathonId: event.params.id })
      canExport = true
      preferenceCounts = Object.fromEntries(
        res.projects.map((p) => [p.id, p.preferences.length]),
      )
      myPreferences = res.projects
        .filter((p) => p.preferences.some((u) => u.id === me))
        .map((p) => p.id)
    } catch (e) {
      if (
        !(
          e instanceof ClientError &&
          (e.code === Status.PERMISSION_DENIED || e.code === Status.UNAUTHENTICATED)
        )
      ) {
        throw e
      }
    }
  }

  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  return {
    proposals: hackathon.projects.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      image: p.image ?? "",
      trackId: p.trackId ?? "",
      trackName: trackNames.get(p.trackId) ?? "",
      status: p.status,
      statusLabel: STATUS_LABEL[p.status] ?? "Unknown",
      statusPreset: STATUS_PRESET[p.status] ?? "preset-tonal",
      isMine: p.creatorId === me,
      preferenceCount: preferenceCounts[p.id] ?? null,
      preferred: myPreferences.includes(p.id),
    })),
    tracks: hackathon.tracks.map((t) => ({ id: t.id, name: t.name })),
    isOrganizer,
    canExport,
    proposalsGate: gateFor(hackathon.capabilities, CAP_PROPOSE),
    preferencesGate: gateFor(hackathon.capabilities, CAP_PREFERENCES),
  }
}

export const actions: Actions = {
  propose: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const title = String(form.get("title") ?? "").trim()
    if (title.length < 3)
      return fail(400, { message: "A proposal needs a title of at least 3 characters." })
    try {
      await project.propose({
        hackathonId: event.params.id,
        title,
        description: String(form.get("description") ?? "").trim(),
        trackId: optionalText(form, "trackId"),
        image: optionalText(form, "image"),
      })
    } catch (e) {
      return formError(e)
    }

    return { proposed: title }
  },

  edit: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const projectId = String(form.get("projectId") ?? "")
    if (!projectId) return fail(400, { message: "Missing proposal." })
    try {
      await project.edit({
        projectId,
        title: optionalText(form, "title"),
        // Unlike the title, an emptied description is a real edit.
        description: String(form.get("description") ?? ""),
        // "" clears the track, a uuid re-points it; sending nothing leaves it.
        trackId: String(form.get("trackId") ?? ""),
        image: String(form.get("image") ?? ""),
      })
    } catch (e) {
      return formError(e)
    }

    return { edited: projectId }
  },

  delete: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const projectId = String(form.get("projectId") ?? "")
    if (!projectId) return fail(400, { message: "Missing proposal." })
    try {
      await project.delete({ projectId })
    } catch (e) {
      return formError(e)
    }

    return { deleted: projectId }
  },

  approve: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const projectId = String(form.get("projectId") ?? "")
    if (!projectId) return fail(400, { message: "Missing proposal." })
    try {
      await project.approve({ projectId })
    } catch (e) {
      return formError(e)
    }

    return { approved: projectId }
  },

  disapprove: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const projectId = String(form.get("projectId") ?? "")
    if (!projectId) return fail(400, { message: "Missing proposal." })
    try {
      await project.disapprove({ projectId })
    } catch (e) {
      return formError(e)
    }

    return { disapproved: projectId }
  },

  prefer: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const projectId = String(form.get("projectId") ?? "")
    if (!projectId) return fail(400, { message: "Missing proposal." })
    try {
      await project.setPreference({ projectId })
    } catch (e) {
      return formError(e)
    }

    return { preferred: projectId }
  },
}
