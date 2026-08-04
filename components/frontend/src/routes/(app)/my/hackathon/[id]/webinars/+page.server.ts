import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// There is no webinar entity in the backend, and there is no session or talk
// entity either — so anything shaped like a speaker line-up here would be
// invented. The product models pre-event sessions the way the lifecycle
// recipe publishes them: as event pages (`act4.webinars` creates a page
// titled "Pre-event webinars" carrying the two sessions and their recording
// links). This tab therefore reads the real pages.
//
// PageService.List is used rather than the layout's `hackathon.pages` because
// the backend decides visibility there: a plain member sees published pages
// only, while someone with page-write also sees drafts. The layout's Get
// embeds every page regardless, which would leak unpublished drafts.
const SESSION_HINT = /webinar|session|talk|recording|livestream|stream|workshop|kick-?off/i

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

  // Titles are organizer-written prose, so this split is a hint and never a
  // filter: pages that do not read like session announcements are still
  // listed, just under their own heading. Nothing published is hidden.
  return {
    sessions: shaped.filter((p) => SESSION_HINT.test(p.title)),
    otherPages: shaped.filter((p) => !SESSION_HINT.test(p.title)),
  }
}
