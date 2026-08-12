/**
 * The browser half of an upload: re-encode, presign, PUT.
 *
 * This module is the ONE copy of that sequence. It started life inside
 * MarkdownEditor.svelte, which is why the event logo stayed the only other
 * uploader for weeks — every new surface meant copying ~60 lines of canvas
 * work, protocol detail and error handling, so nobody did. Anything that needs
 * to accept a picture now imports `uploadImage` (or mounts
 * `ImageUploadField.svelte`, which wraps it).
 *
 * Three properties are deliberate and must survive any edit here:
 *
 *   - the bytes go STRAIGHT to the object store. The app server only ever sees
 *     the presign request (three numbers and two strings);
 *   - size and content type are conditions ON the presign, so an oversized or
 *     wrong-typed file is refused before a byte moves. A 403 from the store is
 *     therefore never "the upload is too big" — it means a PROXY between here
 *     and the store rewrote a signed header, and in practice that is the Host;
 *   - what comes back and gets stored is a root-relative PATH, never the
 *     presigned URL — presigns expire and are bearer credentials.
 */

/**
 * What a file picker may offer. Kept in step with `imageTypes` in
 * components/backend/internal/service/storage_service.go; the backend refuses
 * anything else regardless, so this only spares a round trip.
 *
 * image/svg+xml is absent on both sides on purpose: /objects is the app's OWN
 * origin, so a stored SVG is script running as the application.
 */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"

/** What the presign endpoints answer with. */
export type Presigned = {
  /** Where the browser PUTs the bytes. Expires; never stored. */
  uploadUrl: string
  /** The stable, root-relative path. THIS is what goes in the database. */
  publicUrl: string
  /** The object key, for private objects that have no public path. */
  key?: string
}

/** A failed upload, carrying the message that is worth showing a person. */
export class UploadError extends Error {}

/**
 * Re-encode to WebP in the browser, before anything is uploaded.
 *
 * Done here rather than server-side, and BEFORE the presign: the presign's size
 * and content-type are CONDITIONS on the signature, so converting after signing
 * would guarantee a mismatch. Converting on the server would mean sending the
 * large original first, which is what presigned uploads exist to avoid.
 *
 * Returns the original untouched when conversion is not appropriate:
 *   - GIF, because a canvas keeps only the first frame and a silently
 *     de-animated GIF is worse than a larger file.
 *   - already-WebP, which has nothing to gain.
 *   - any failure at all — an older browser, a decode error, or a result that
 *     came out BIGGER than the original, which happens with flat graphics.
 *     Uploading the original is always the safe answer.
 */
export async function toWebp(file: File, maxEdge = 2000): Promise<File> {
  if (file.type === "image/gif" || file.type === "image/webp") return file
  try {
    const bitmap = await createImageBitmap(file)
    // Cap the long edge: photographs off a phone are 4000px+, and nothing in
    // the app renders them above about 1600 CSS pixels.
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    )
    // A browser without WebP encoding returns a PNG instead of null, so check
    // the type rather than trusting the request.
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size)
      return file

    const name = file.name.replace(/\.[^.]+$/, "") + ".webp"
    return new File([blob], name, { type: "image/webp" })
  } catch {
    return file
  }
}

/**
 * Ask `endpoint` for permission to store `file`.
 *
 * The endpoint decides the upload KIND and the owner from its own route — a
 * client never names a path, a kind or a ceiling. A refusal here is a real
 * answer (too big, wrong type, not your event), and its message comes from the
 * backend, which is the only layer that knows the actual limit.
 */
async function presign(endpoint: string, file: File): Promise<Presigned> {
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    })
  } catch {
    throw new UploadError("Could not reach the server")
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new UploadError(text.trim() || "Could not start the upload")
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new UploadError("Could not start the upload")
  }
  const { uploadUrl, publicUrl, key } = (body ?? {}) as Partial<Presigned>
  if (!uploadUrl) throw new UploadError("Could not start the upload")

  return { uploadUrl, publicUrl: publicUrl ?? "", key }
}

/**
 * Re-encode, presign, and PUT. Resolves with the stored path.
 *
 * `publicUrl` is empty for a PRIVATE kind (submission attachments), where the
 * caller stores `key` and reads it back through a signed download URL instead.
 */
export async function uploadImage(
  endpoint: string,
  original: File,
): Promise<Presigned & { file: File }> {
  const file = await toWebp(original)
  const signed = await presign(endpoint, file)

  // Straight to the object store. The declared Content-Type is baked into the
  // signature, so it has to be sent back exactly — and whatever arrives is
  // what the object is STORED as: send none and the browser later refuses to
  // render its own image.
  let put: Response
  try {
    put = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    })
  } catch {
    throw new UploadError("Could not reach the object store")
  }
  if (!put.ok) throw new UploadError(`Storage rejected the upload (${put.status})`)

  return { ...signed, file }
}

/**
 * Alt text from a filename: "venue-photo.png" -> "venue photo".
 *
 * From the name the PERSON chose, not the converted one. An empty alt on a
 * content image is a hole for anyone using a screen reader, and the person who
 * picked the file is the only one who knows what it shows.
 */
export function altFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")
}
