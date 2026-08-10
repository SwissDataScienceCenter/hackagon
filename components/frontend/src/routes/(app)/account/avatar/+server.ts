import type { RequestHandler } from "./$types"
import { error } from "@sveltejs/kit"
import { presignUpload } from "$lib/server/upload"
import { UploadKind } from "$lib/server/grpc/generated/storage/entities/upload_kind"

/**
 * Presign a profile picture for the SIGNED-IN person.
 *
 * The owner is `locals.platformUser.id` — never anything the request carried —
 * so this endpoint cannot be pointed at someone else's profile even by a caller
 * writing its body by hand. The backend checks the same thing again from the
 * token (`owner.KeycloakID != sub` unless you are a global admin), which is
 * where the actual rule lives.
 */
export const POST: RequestHandler = (event) => {
  const me = event.locals.platformUser
  if (!me) error(401, "Sign in to change your profile picture")

  return presignUpload(event, UploadKind.UPLOAD_KIND_USER_AVATAR, me.id)
}
