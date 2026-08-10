import type { RequestHandler } from "./$types"
import { presignUpload } from "$lib/server/upload"
import { UploadKind } from "$lib/server/grpc/generated/storage/entities/upload_kind"

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
