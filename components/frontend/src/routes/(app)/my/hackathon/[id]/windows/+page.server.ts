import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The event's deadlines, and the override for when a deadline meets reality.
//
// A window is a clock, not a permission: the backend enforces it, and a closed
// window answers FAILED_PRECONDITION rather than PERMISSION_DENIED so the UI
// can say "the deadline passed" instead of "you are not allowed". The override
// exists because AV problems during demos are not a reason to lose an event's
// submissions — it extends from NOW, so an organiser never has to compute a
// wall-clock time under pressure.

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

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in LOCAL time, not an ISO string. */
function forInput(d: Date | undefined): string {
  if (!d) return ""
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 16)
}

function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only this event's organisers can do that." })
    if (e.code === Status.INVALID_ARGUMENT) return fail(400, { message: e.details })
    if (e.code === Status.FAILED_PRECONDITION) return fail(409, { message: e.details })
  }
  throw e
}

export const load: PageServerLoad = async (event) => {
  const { myMembership } = await event.parent()
  const { config } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only this event's organisers can set its deadlines")
  }

  // Read through ConfigService: the deadlines are not nested on the hackathon,
  // and SetWindows replaces every field, so the form MUST prefill or saving it
  // would blank whatever the organiser could not see.
  const { windows: w } = await config.getWindows({ hackathonId: event.params.id })

  return {
    windows: {
      registrationOpens: forInput(w?.registrationOpens),
      registrationCloses: forInput(w?.registrationCloses),
      proposalsClose: forInput(w?.proposalsClose),
      preferencesClose: forInput(w?.preferencesClose),
      submissionsClose: forInput(w?.submissionsClose),
      latePolicy: w?.latePolicy ?? "",
    },
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { config } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    try {
      // Every field optional and absent means "no deadline": an event that
      // never closes proposals is a legitimate configuration, not a gap.
      await config.setWindows({
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

    return { saved: true }
  },

  override: async (event) => {
    const { config } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const minutes = Number(form.get("extendMinutes") ?? 0)
    if (!minutes || minutes < 1) return fail(400, { message: "Say how many minutes to add." })

    try {
      // Anchored on now, not on the original deadline: an organiser reaching
      // for this is already past it and wants "fifteen more minutes from here".
      await config.overrideWindow({
        hackathonId: event.params.id,
        window: String(form.get("window") ?? ""),
        extendMinutes: minutes,
        reason: String(form.get("reason") ?? ""),
      })
    } catch (e) {
      return formError(e)
    }

    return { overrode: true }
  },
}
