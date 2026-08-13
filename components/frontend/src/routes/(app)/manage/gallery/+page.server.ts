import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { failListing } from "$lib/server/upload"
import { ObjectScope } from "$lib/server/grpc/generated/storage/entities/object_scope"

/**
 * The platform media library — every picture the instance has been uploaded.
 *
 * Admin-only, and the backend is what says so: `OBJECT_SCOPE_ALL_MEDIA` spans
 * events the caller may have no part in, so it authorizes on the global Admin
 * role. This route only translates that verdict (`failListing`); the URL is
 * guessable and an organiser who types it gets a 403 from the one layer that
 * decides.
 *
 * Two prefixes are NOT here and cannot be: `users/<id>/avatar/` and
 * `teams/…/submissions/`. No listing scope covers them — see ObjectScope in
 * the proto. So "all pictures" means all pictures the platform PUBLISHES, not
 * every byte in the bucket, and the page says so on screen rather than
 * implying otherwise by omission.
 *
 * Pagination is a query parameter rather than a client fetch, so the second
 * page is a real URL that survives a reload and works with no JavaScript.
 */
/**
 * How many tiles a page shows. Larger than the picker's 60 because this page IS
 * the library rather than a chooser, and capped well under the backend's own 200
 * so the grid stays scrollable rather than endless.
 */
const PAGE_SIZE = 120

export const load: PageServerLoad = async (event) => {
  const { storage, hackathon } = requireGrpc(event.locals.grpc)
  const pageToken = event.url.searchParams.get("page") ?? ""

  let listing
  try {
    listing = await storage.listObjects({
      scope: ObjectScope.OBJECT_SCOPE_ALL_MEDIA,
      ownerId: "",
      pageSize: PAGE_SIZE,
      pageToken,
    })
  } catch (e) {
    failListing(e)
  }

  // Event names, so a tile says which hackathon a picture belongs to instead of
  // showing a uuid. Best-effort on purpose: a failure here must not take the
  // gallery down, because the pictures are the point and the label is a
  // courtesy. An id with no name falls back to the id.
  let eventNames: Record<string, string> = {}
  try {
    const events = await hackathon.list({})
    eventNames = Object.fromEntries(
      events.hackathons.map((h) => [h.id, h.name]),
    )
  } catch {
    eventNames = {}
  }

  return {
    images: listing.objects.map((o) => ({
      key: o.key,
      url: o.url,
      sizeBytes: Number(o.sizeBytes),
      lastModified: o.lastModified?.toISOString(),
    })),
    nextPageToken: listing.nextPageToken,
    truncated: listing.truncated,
    pageToken,
    eventNames,
  }
}
