import { error, json } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import { requireGrpc } from "$lib/server/grpc/client"
import type { RequestEvent } from "@sveltejs/kit"
import type { UploadKind } from "$lib/server/grpc/generated/storage/entities/upload_kind"

/**
 * Server-only: turn one presign request into a JSON answer.
 *
 * Every upload surface needs the same six lines and the same four error
 * translations, so they live here once. What each ROUTE decides is the two
 * things that must not come from the client: the upload KIND and the OWNER id.
 * The backend re-derives the key from those and re-checks the permission
 * regardless — this layer is convenience, not control.
 *
 * The bytes never reach this process. The response is a presigned PUT the
 * browser uses directly, which is why a 15 MB photo does not occupy an
 * app-server request and SvelteKit's body-size limit has nothing to do with
 * what anyone may upload.
 */
export async function presignUpload(
  event: RequestEvent,
  kind: UploadKind,
  ownerId: string,
): Promise<Response> {
  const { storage } = requireGrpc(event.locals.grpc)

  let body: { filename?: unknown; contentType?: unknown; sizeBytes?: unknown }
  try {
    body = await event.request.json()
  } catch {
    error(400, "Expected a JSON body")
  }

  const filename = typeof body.filename === "string" ? body.filename : ""
  const contentType =
    typeof body.contentType === "string" ? body.contentType : ""
  const sizeBytes = Number(body.sizeBytes)
  if (
    !filename ||
    !contentType ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes <= 0
  ) {
    error(400, "filename, contentType and sizeBytes are required")
  }

  try {
    const result = await storage.createUploadUrl({
      kind,
      ownerId,
      filename,
      contentType,
      sizeBytes: Math.trunc(sizeBytes),
    })

    return json({
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key: result.key,
    })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to upload that")
    }
    if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
      // INVALID_ARGUMENT here is a real answer, not a bug: it is the size
      // ceiling and the content-type allowlist refusing the file BEFORE it is
      // transferred. The backend's own message names the actual limit or the
      // rejected type, which is more useful than anything this layer could
      // invent.
      error(400, e.details)
    }
    if (e instanceof ClientError && e.code === Status.UNAVAILABLE) {
      error(503, "File storage is not configured on this server")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, e.details || "Not found")
    }
    throw e
  }
}
