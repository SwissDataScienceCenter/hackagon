import type { Actions, PageServerLoad } from "./$types"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { markdownExcerpt } from "$lib/utils/markdown"
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
      // Flattened here rather than in the row so the bodies — 10 000 characters
      // each, and every page of the hackathon is in this list — never cross the
      // wire. The row only ever needs the opening line or two.
      excerpt: markdownExcerpt(p.content),
      // An excerpt can come out empty from a page that is not: one holding only
      // an image with no alt text has nothing to quote. The row needs to tell
      // those two apart rather than call a written page blank.
      hasContent: p.content.trim() !== "",
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

  // What a drag-and-drop reorder submits: the whole sequence in one call, which
  // is what `SetOrder` insists on — it refuses a list that is not every page of
  // the hackathon exactly once. MoveUp/MoveDown below stay as the keyboard path.
  setOrder: async (event) => {
    const raw = (await event.request.formData()).get("pageIds")
    if (typeof raw !== "string" || raw === "") {
      return fail(400, { message: "Invalid page order" })
    }
    const pageIds = raw.split(",").filter((id) => id !== "")
    if (pageIds.length === 0) {
      return fail(400, { message: "Invalid page order" })
    }

    const { page } = requireGrpc(event.locals.grpc)
    try {
      await page.setOrder({ hackathonId: event.params.id, pageIds })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to reorder pages",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Page not found" })
      }
      // The list we sent is no longer the hackathon's set of pages — one was
      // added or deleted elsewhere while this tab held a stale copy. The page
      // refetches on any failure, so saying so is all that is left to do.
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(409, {
          message:
            "The pages changed while you were reordering. The list has been refreshed — please try again.",
        })
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
