import type { RequestHandler } from "./$types"
import { presignUpload } from "$lib/server/upload"
import { UploadKind } from "$lib/server/grpc/generated/storage/entities/upload_kind"

/**
 * Presign the event logo for this hackathon.
 *
 * Its own kind rather than reusing `media`, because the logo has its own
 * prefix (`hackathons/<id>/logo/`) and its own 5 MB ceiling — both decided by
 * the backend from the kind alone.
 *
 * This replaces a `presignLogo` FORM ACTION on the edit page: an action can
 * only be reached from the route that declares it, so the uploader could not
 * be a component, and the page had to hand-roll `use:enhance`'s wire protocol
 * to talk to it. A plain JSON endpoint is what makes one shared
 * `ImageUploadField` possible.
 */
export const POST: RequestHandler = (event) =>
  presignUpload(event, UploadKind.UPLOAD_KIND_HACKATHON_LOGO, event.params.id)
