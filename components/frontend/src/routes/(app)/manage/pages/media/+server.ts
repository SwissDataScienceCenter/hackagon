import type { RequestHandler } from "./$types"
import { presignUpload, listStoredImages } from "$lib/server/upload"
import { UploadKind } from "$lib/server/grpc/generated/storage/entities/upload_kind"
import { ObjectScope } from "$lib/server/grpc/generated/storage/entities/object_scope"

/**
 * Presign one image upload for a PLATFORM page (about, privacy, terms).
 *
 * The owner id is deliberately empty, and this is the only presign route where
 * that is correct: a site page belongs to no event and no person, so there is
 * nothing to file it under. `UPLOAD_KIND_SITE_MEDIA` keys it as `site/media/…`
 * and authorizes on the GLOBAL Admin role — the same rule every
 * SitePageService mutation uses.
 *
 * No permission check here on purpose. The backend is authoritative and answers
 * PermissionDenied to anyone who is not a platform admin, which
 * $lib/server/upload turns into a 403; duplicating the rule in the frontend is
 * how the two get to disagree. An endpoint rather than a form action, because
 * the caller is MarkdownEditor and an action is only reachable from the route
 * that declares it.
 */
export const POST: RequestHandler = (event) =>
  presignUpload(event, UploadKind.UPLOAD_KIND_SITE_MEDIA, "")

/**
 * What the platform pages have already uploaded (`site/media/`), so a picture
 * can be reused across About, Privacy and Terms instead of stored twice.
 *
 * Same route as the presign, same rule: `OBJECT_SCOPE_SITE_MEDIA` authorizes on
 * the GLOBAL Admin role, which is what UPLOAD_KIND_SITE_MEDIA above already
 * requires. No permission check here — the backend is authoritative and
 * duplicating the rule is how the two get to disagree.
 */
export const GET: RequestHandler = (event) =>
  listStoredImages(event, ObjectScope.OBJECT_SCOPE_SITE_MEDIA, "")
