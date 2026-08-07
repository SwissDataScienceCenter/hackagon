import type { RequestHandler } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { UploadKind } from "$lib/server/grpc/generated/storage/entities/upload_kind"
import { error, json } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * Presign one gallery/media upload for this hackathon.
 *
 * An endpoint rather than a form action, because the caller is a reusable
 * editor component that has no idea which page it is mounted on — a form
 * action would have to be copy-pasted into every route that embeds a markdown
 * field, which is how the logo uploader ended up being the only one.
 *
 * The bytes never come here. This returns a presigned PUT and the browser
 * uploads straight to the object store, which is the whole point of presigning:
 * a 15 MB photo does not travel through the app server.
 */
export const POST: RequestHandler = async (event) => {
  const { storage } = requireGrpc(event.locals.grpc)

  let body: { filename?: unknown; contentType?: unknown; sizeBytes?: unknown }
  try {
    body = await event.request.json()
  } catch {
    error(400, "Expected a JSON body")
  }

  const filename = typeof body.filename === "string" ? body.filename : ""
  const contentType = typeof body.contentType === "string" ? body.contentType : ""
  const sizeBytes = Number(body.sizeBytes)
  if (!filename || !contentType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    error(400, "filename, contentType and sizeBytes are required")
  }

  try {
    // The KEY is the server's to decide — nothing here names a path, so the
    // worst a hostile caller can do is ask for a kind casbin refuses. Size and
    // content type are conditions ON the signature, so an oversized or
    // wrong-typed upload is refused before a byte moves.
    const result = await storage.createUploadUrl({
      kind: UploadKind.UPLOAD_KIND_HACKATHON_MEDIA,
      ownerId: event.params.id,
      filename,
      contentType,
      sizeBytes,
    })
    return json({
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key: result.key,
    })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to upload media for this event")
    }
    if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
      // The backend's own message names the actual limit or the rejected type,
      // which is more useful than anything this layer could invent.
      error(400, e.details)
    }
    throw e
  }
}
