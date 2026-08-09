import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import {
  parsePhaseForm,
  syncPhaseCapabilities,
} from "$lib/server/hackathon/phaseForm"
import { resolve } from "$app/paths"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the pages a
  // phase can link to.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can add phases")
  }

  return {
    hackathonId: hackathon.id,
    pages: hackathon.pages.map((p) => ({ id: p.id, title: p.title })),
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { phase, hackathon } = requireGrpc(event.locals.grpc)

    const parsed = parsePhaseForm(await event.request.formData())
    if (!parsed.ok) {
      return fail(400, { message: parsed.message })
    }
    const values = parsed.values

    try {
      const created = await phase.create({
        hackathonId: event.params.id,
        name: values.name,
        description: values.description,
        // TODO(backend: phase-create-drops-dates): dates are deliberately not
        // sent, and the form does not offer them. `CreateRequest` accepts
        // `starts_at`/`ends_at` and buf.validate checks that they agree, but the
        // handler's builder never calls `SetStartsAt`/`SetEndsAt`
        // (`phase_service.go:181-188`) — so they are accepted, reported as
        // created, and discarded. Confirmed live: create with dates, then Get
        // returns null for both. `Edit` sets them correctly, which is why
        // scheduling happens there. Send them here, and restore the fields in
        // `PhaseForm` via `datesEditable`, once Create stores them.
        //
        // Sending nothing for pageId means "no linked page" — `page_id` is
        // optional and its CEL rule only checks the shape of a value that is
        // present.
        pageId: values.pageId !== "" ? values.pageId : undefined,
      })

      // Capabilities are linked after the phase exists: in our model the link
      // lives on the capability, so it needs the new phase's id.
      if (created.phaseId) {
        const { hackathon: current } = await hackathon.get({
          hackathonId: event.params.id,
        })
        await syncPhaseCapabilities(
          hackathon,
          event.params.id,
          created.phaseId,
          values.capabilities,
          current?.capabilities,
        )
      }
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to add phases here",
        })
      }
      // A page id from another hackathon, or one that has since been deleted.
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: e.details })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/timeline`))
  },
}
