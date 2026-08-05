import type { Actions, PageServerLoad } from "./$types"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePages } from "$lib/server/hackathon/capabilities"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns the pages,
  // unfiltered — same source Timeline's list uses for phases.
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManagePages(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can manage pages")
  }

  // The phase (if any) each page is linked from — dropping a phase chip onto a
  // page, or unlinking its badge, both go through `PhaseService.Edit`, since
  // `page_id` lives on the phase side of the edge, not the page's.
  const phaseByPageId = new Map(
    hackathon.phases
      .filter((p) => p.pageId)
      .map((p) => [p.pageId as string, { id: p.id, name: p.name }]),
  )

  // `hackathon.get` nests pages in whatever order ent returned them, not
  // `order` — unlike `PageService.List`, which sorts server-side. Sorting here
  // is what makes the list mean anything, since `order` is exactly what
  // MoveUp/MoveDown exist to control.
  const pages = [...hackathon.pages]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      id: p.id,
      title: p.title,
      visible: p.visible,
      phase: phaseByPageId.get(p.id),
    }))

  const phases = hackathon.phases.map((p) => ({
    id: p.id,
    name: p.name,
    pageId: p.pageId,
  }))

  return { hackathonId: hackathon.id, pages, phases }
}

export const actions: Actions = {
  // Drop target for a dragged phase chip, and the badge's unlink "×" — both
  // just set which page (if any) the phase points to. Empty string unlinks;
  // a non-empty id links, repointing it away from whatever page held it.
  linkPhase: async (event) => {
    const formData = await event.request.formData()
    const phaseId = formData.get("phaseId")
    const pageId = formData.get("pageId")
    if (typeof phaseId !== "string" || phaseId === "" || typeof pageId !== "string") {
      return fail(400, { message: "Invalid phase link" })
    }

    const { phase } = requireGrpc(event.locals.grpc)
    try {
      await phase.edit({ phaseId, pageId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to link phases to pages",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Phase not found" })
      }
      throw e
    }
  },

  toggleVisible: async (event) => {
    const formData = await event.request.formData()
    const pageId = formData.get("pageId")
    const visible = formData.get("visible")
    if (
      typeof pageId !== "string" ||
      pageId === "" ||
      (visible !== "true" && visible !== "false")
    ) {
      return fail(400, { message: "Invalid page" })
    }

    const { page } = requireGrpc(event.locals.grpc)
    try {
      await page.edit({ pageId, visible: visible === "true" })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit this page",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Page not found" })
      }
      throw e
    }
  },

  moveUp: async (event) => {
    const pageId = (await event.request.formData()).get("pageId")
    if (typeof pageId !== "string" || pageId === "") {
      return fail(400, { message: "Invalid page" })
    }

    const { page } = requireGrpc(event.locals.grpc)
    try {
      await page.moveUp({ pageId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to reorder pages",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Page not found" })
      }
      throw e
    }
  },

  moveDown: async (event) => {
    const pageId = (await event.request.formData()).get("pageId")
    if (typeof pageId !== "string" || pageId === "") {
      return fail(400, { message: "Invalid page" })
    }

    const { page } = requireGrpc(event.locals.grpc)
    try {
      await page.moveDown({ pageId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to reorder pages",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Page not found" })
      }
      throw e
    }
  },
}
