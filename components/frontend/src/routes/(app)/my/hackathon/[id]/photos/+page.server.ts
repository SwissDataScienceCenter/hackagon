import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// There is no photo entity and no blob store: media is links-first until
// object storage lands (docs/roadmap.md), so this tab has no uploads to show
// and will not pretend otherwise. What does exist is the way the lifecycle
// recipe actually publishes a gallery — `act8.photos` creates an event page
// titled "Photos & Winners" pointing at where the material lives. So the tab
// reads the real pages and renders whatever the organizers put there.
//
// PageService.List rather than the layout's `hackathon.pages`: the backend
// applies the visibility rule there (drafts only for page-writers), while the
// layout's Get embeds every page including unpublished ones.
const PHOTO_HINT = /photo|gallery|album|picture|snapshot|impression/i

export const load: PageServerLoad = async (event) => {
  const { page } = requireGrpc(event.locals.grpc)

  let pages
  try {
    pages = (await page.list({ hackathonId: event.params.id })).pages
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "Access denied")
    if (e instanceof ClientError && e.code === Status.NOT_FOUND)
      error(404, "Hackathon not found")
    throw e
  }

  // Backend order (the `order` column) is preserved.
  const shaped = pages.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    updatedAt: p.modifiedAt ?? p.createdAt ?? null,
  }))

  // A hint, not a filter — pages that do not read like galleries are still
  // listed under their own heading rather than dropped.
  return {
    galleries: shaped.filter((p) => PHOTO_HINT.test(p.title)),
    otherPages: shaped.filter((p) => !PHOTO_HINT.test(p.title)),
  }
}
