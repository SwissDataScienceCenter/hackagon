import type { RequestHandler } from "./$types"
import { presignUpload, listStoredImages } from "$lib/server/upload"
import { UploadKind } from "$lib/server/grpc/generated/storage/entities/upload_kind"
import { ObjectScope } from "$lib/server/grpc/generated/storage/entities/object_scope"

/**
 * Presign one gallery/media upload for this hackathon.
 *
 * An endpoint rather than a form action, because the caller is a reusable
 * editor component that has no idea which page it is mounted on — a form
 * action would have to be copy-pasted into every route that embeds a markdown
 * field, which is how the logo uploader ended up being the only one.
 *
 * The KIND is this route's decision, not the caller's, and the owner is the
 * hackathon in the path. Everything else — the key, the ceiling, the
 * allowlist, the permission — is the backend's; see $lib/server/upload.
 */
export const POST: RequestHandler = (event) =>
  presignUpload(event, UploadKind.UPLOAD_KIND_HACKATHON_MEDIA, event.params.id)

/**
 * What this hackathon has already uploaded — logos and page media alike, since
 * someone picking a picture wants everything the event has.
 *
 * The SAME route as the presign above, and that is the point: listing a prefix
 * takes the same permission as writing to it (hackathon `write`), so a caller
 * who may reach POST here may reach GET here, and neither this file nor the
 * component calling it has to know the rule.
 *
 * Covers `hackathons/<id>/` and nothing else. In particular it cannot reach
 * `users/<id>/avatar/` — no scope can; see ObjectScope in the proto.
 */
export const GET: RequestHandler = (event) =>
  listStoredImages(
    event,
    ObjectScope.OBJECT_SCOPE_HACKATHON_MEDIA,
    event.params.id,
  )
