import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { canEditHackathon } from "$lib/navigation"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// `data.hackathon` reaches the page through the `[id]` layout's own load —
// nothing here needs to re-fetch it, only gate who may see the form.
export const load: PageServerLoad = async (event) => {
  const { myMembership, isGlobalAdmin } = await event.parent()

  if (!canEditHackathon(myMembership ?? undefined, isGlobalAdmin)) {
    error(403, "You don't have permission to edit this hackathon")
  }
}

export const actions: Actions = {
  // The logo upload is NOT here. It was a `presignLogo` action, and an action
  // can only be reached from the route that declares it — which is why the
  // logo uploader could not become a component and stayed the only one in the
  // app. It lives at `./logo` (+server.ts) now, alongside `./media`, and the
  // page mounts the shared `ImageUploadField` against it.
  edit: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const name = form.get("name")
    const visibility = form.get("visibility")
    const description = form.get("description")
    const startsAt = form.get("startsAt")
    const endsAt = form.get("endsAt")
    const logo = form.get("logo")
    const maxParticipantsRaw = form.get("maxParticipants")

    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Name must be at least 3 characters" })
    }

    // Empty clears back to unlimited: this form is always prefilled, so a
    // cleared field is a deliberate removal — the backend reads 0 as "no cap".
    let maxParticipants = 0
    if (
      typeof maxParticipantsRaw === "string" &&
      maxParticipantsRaw.trim() !== ""
    ) {
      const n = Number(maxParticipantsRaw)
      if (!Number.isInteger(n) || n < 0) {
        return fail(400, {
          message: "Capacity must be a whole number of people",
        })
      }
      maxParticipants = n
    }
    if (visibility !== "public" && visibility !== "private") {
      return fail(400, { message: "Visibility is required" })
    }

    // Status is computed server-side from both dates, so one without the other
    // leaves a hackathon that can never be anything but PENDING.
    const hasStartsAt = typeof startsAt === "string" && startsAt !== ""
    const hasEndsAt = typeof endsAt === "string" && endsAt !== ""
    if (hasStartsAt !== hasEndsAt) {
      return fail(400, {
        message: "Start and end date must be set together",
      })
    }
    if (
      hasStartsAt &&
      hasEndsAt &&
      new Date(endsAt as string) < new Date(startsAt as string)
    ) {
      return fail(400, { message: "End date must not precede the start date" })
    }

    try {
      await hackathon.edit({
        hackathonId: event.params.id,
        name: name.trim(),
        visibility:
          visibility === "public"
            ? Visibility.VISIBILITY_PUBLIC
            : Visibility.VISIBILITY_PRIVATE,
        // Sent as typed, not `|| undefined`: unlike Create, this form is always
        // pre-filled with the current value, so an empty string is the user
        // clearing the field on purpose and must reach the backend as "".
        description: typeof description === "string" ? description : undefined,
        logo: typeof logo === "string" ? logo : undefined,
        // TODO(backend: hackathon-edit-clear-dates): `hasStartsAt === hasEndsAt
        // === false` sends both as `undefined`, which `Edit` reads as "leave
        // unchanged" rather than "clear them" — there is no request that
        // returns an already-dated hackathon to dateless. Harmless here: dates
        // can still be *changed* freely, only full removal silently no-ops.
        startsAt: hasStartsAt ? new Date(startsAt as string) : undefined,
        endsAt: hasEndsAt ? new Date(endsAt as string) : undefined,
        // Always sent: the field is always on the form, so absence cannot mean
        // "leave unchanged" here — 0 means unlimited.
        maxParticipants,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit this hackathon",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Hackathon not found" })
      }
      throw e
    }

    redirect(303, "/dashboard")
  },

  // Its own action because it is its own RPC: ConfigService.SetBranding writes
  // the forms row, HackathonService.Edit writes the hackathon row, and one
  // submit that half-succeeds is worse than two that each say what they did.
  //
  // No redirect: an organiser adjusting colours wants to see the preview
  // update, not to be thrown back to the dashboard.
  branding: async (event) => {
    const { config } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const text = (key: string) => String(form.get(key) ?? "").trim()

    try {
      await config.setBranding({
        hackathonId: event.params.id,
        // Empty means "unset" and must reach the backend as an empty string
        // rather than undefined: this form is always prefilled, so a cleared
        // field is a deliberate removal, not an untouched one.
        primaryColor: text("primaryColor"),
        accentColor: text("accentColor"),
        bannerText: text("bannerText"),
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit this hackathon",
        })
      }
      throw e
    }

    return { branded: true }
  },
}
