import type { RequestHandler } from "./$types"
import { presignUpload, listStoredImages } from "$lib/server/upload"
import { UploadKind } from "$lib/server/grpc/generated/storage/entities/upload_kind"
import { ObjectScope } from "$lib/server/grpc/generated/storage/entities/object_scope"

/**
 * Storage endpoint for the platform media library at `/manage/gallery`.
 *
 * POST presigns an upload as SITE_MEDIA (`site/media/…`) — the platform's own
 * prefix, which is the only one an upload made from a page that belongs to no
 * event could sensibly land in. It cannot upload INTO a hackathon: that would
 * need the event's id, and choosing one on a platform page is a decision this
 * route has no basis for making.
 *
 * GET lists ALL_MEDIA — `hackathons/` and `site/media/` together. Both halves
 * require the global Admin role, so an organiser who reaches this URL is
 * refused by the backend rather than shown a filtered view; the frontend does
 * not decide access, it translates the verdict ($lib/server/upload).
 *
 * The page itself renders the first listing from its own `load`, server-side.
 * This GET exists for the picker dialog, which loads a fresh listing after an
 * upload — the same endpoint answering both keeps them from disagreeing about
 * what the library contains.
 */
export const POST: RequestHandler = (event) =>
  presignUpload(event, UploadKind.UPLOAD_KIND_SITE_MEDIA, "")

export const GET: RequestHandler = (event) =>
  listStoredImages(event, ObjectScope.OBJECT_SCOPE_ALL_MEDIA, "")
