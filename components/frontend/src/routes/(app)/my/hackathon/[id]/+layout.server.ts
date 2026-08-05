import type { LayoutServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: LayoutServerLoad = async (event) => {
  const { hackathon, page } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  let result
  try {
    result = await hackathon.get({ hackathonId: event.params.id })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You are not a confirmed member of this hackathon")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Hackathon not found")
    }
    throw e
  }

  if (!result.hackathon) {
    error(404, "Hackathon not found")
  }

  const myMembership =
    result.hackathon.members.find((m) => m.user?.id === platformUserId) ?? null

  // The sidebar lists this hackathon's content pages. A separate PageService.List
  // rather than reading result.hackathon.pages: List is the authoritative source
  // for what a viewer may see, filtering `visible: false` server-side, while
  // hackathon.get hands those to plain members too.
  //
  // A failure here degrades the nav to its fixed entries rather than failing this
  // load and blanking the hackathon — the content area is the part that has to
  // report a real error, and hackathon.get above already did if there was one.
  let hackathonPages: { id: string; title: string }[] = []
  try {
    const { pages } = await page.list({ hackathonId: event.params.id })
    hackathonPages = pages.map((p) => ({ id: p.id, title: p.title }))
  } catch (err) {
    event.locals.logger.warn(
      { err },
      "LAYOUT: page list failed, rendering the hackathon nav without content pages",
    )
  }

  return { hackathon: result.hackathon, myMembership, hackathonPages }
}
