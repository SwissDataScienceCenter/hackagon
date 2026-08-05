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

  // The phase (if any) each page is linked from, for display only — the link
  // itself is set on the phase's own edit form, not here.
  const phaseNameByPageId = new Map(
    hackathon.phases
      .filter((p) => p.pageId)
      .map((p) => [p.pageId as string, p.name]),
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
      phaseName: phaseNameByPageId.get(p.id),
    }))

  return { hackathonId: hackathon.id, pages }
}

export const actions: Actions = {
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
