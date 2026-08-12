import { error, json } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"
import { requireGrpc } from "$lib/server/grpc/client"
import type { RequestEvent } from "@sveltejs/kit"
import type { UploadKind } from "$lib/server/grpc/generated/storage/entities/upload_kind"
import type { ObjectScope } from "$lib/server/grpc/generated/storage/entities/object_scope"

/**
 * Server-only: the two storage questions a route can answer for the browser —
 * "may I put this here" (presignUpload) and "what is already here"
 * (listStoredImages). Neither ever carries bytes.
 *
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

/**
 * Server-only: answer "what is already uploaded here" as JSON.
 *
 * Same shape as presignUpload and for the same reason — what a ROUTE decides is
 * the two things that must not come from the client: the SCOPE and the OWNER
 * id. The backend re-derives the prefixes from those and re-checks the
 * permission regardless.
 *
 * The rule the backend applies, worth knowing here because this layer only
 * translates its verdicts: **you may list a prefix exactly when you may write
 * to it.** So the route that presigns an upload and the route that lists what is
 * there answer to the same permission by construction, and a 403 from one means
 * a 403 from the other.
 */
export async function listStoredImages(
  event: RequestEvent,
  scope: ObjectScope,
  ownerId: string,
): Promise<Response> {
  const { storage } = requireGrpc(event.locals.grpc)

  const pageToken = event.url.searchParams.get("page") ?? ""
  const requested = Number(event.url.searchParams.get("pageSize"))
  // 0 means "the server's default". An unparseable or negative number is not
  // worth a 400: the page size is a rendering preference, not a permission.
  const pageSize =
    Number.isFinite(requested) && requested > 0 ? Math.trunc(requested) : 0

  try {
    const result = await storage.listObjects({ scope, ownerId, pageSize, pageToken })

    return json({
      objects: result.objects.map((o) => ({
        key: o.key,
        url: o.url,
        sizeBytes: Number(o.sizeBytes),
        lastModified: o.lastModified?.toISOString(),
      })),
      nextPageToken: result.nextPageToken,
      truncated: result.truncated,
    })
  } catch (e) {
    failListing(e)
  }
}

/**
 * gRPC verdict → HTTP status for a listing. Never returns.
 *
 * Shared by the JSON endpoint above and by the gallery page's own load, so the
 * two cannot disagree about what a refusal means. Anything unexpected is
 * rethrown untouched — an unrecognized failure must surface, not be flattened
 * into a tidy 403.
 */
export function failListing(e: unknown): never {
  if (e instanceof ClientError) {
    // UNAUTHENTICATED before PERMISSION_DENIED, because the backend
    // deliberately distinguishes them: "who are you" and "not you" are
    // different answers and this layer must not merge them into one.
    if (e.code === Status.UNAUTHENTICATED) error(401, "Authentication required")
    if (e.code === Status.PERMISSION_DENIED)
      error(403, "You don't have permission to browse those files")
    if (e.code === Status.NOT_FOUND) error(404, e.details || "Not found")
    if (e.code === Status.INVALID_ARGUMENT)
      error(400, e.details || "Invalid request")
    if (e.code === Status.UNAVAILABLE)
      error(503, "File storage is not configured on this server")
  }

  throw e
}
