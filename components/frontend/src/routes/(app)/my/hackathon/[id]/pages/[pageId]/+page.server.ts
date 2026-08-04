import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { page } = requireGrpc(event.locals.grpc)

  // Fetched rather than picked out of the layout's `hackathon.get` data, even
  // though that response nests the pages: it includes ones with
  // `visible: false`, while PageService.Get denies a hidden page to anyone
  // without write permission. Asking PageService keeps the backend the one
  // deciding what a member may read, instead of the frontend filtering content
  // it has already been handed.
  let result
  try {
    result = await page.get({ pageId: event.params.pageId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "This page is not available")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Page not found")
    }
    throw e
  }

  if (!result.page) {
    error(404, "Page not found")
  }

  // A page id from another hackathon would otherwise render inside this
  // hackathon's shell, under its nav and header.
  if (result.page.hackathonId !== event.params.id) {
    error(404, "Page not found")
  }

  return { page: { title: result.page.title, content: result.page.content } }
}
