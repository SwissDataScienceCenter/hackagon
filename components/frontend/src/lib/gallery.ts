/**
 * The browser half of "show me what is already uploaded".
 *
 * Companion to `$lib/upload.ts`, and deliberately its own module: that one is
 * the single copy of re-encode → presign → PUT, and folding a read into it
 * would blur the one sequence it exists to keep in one place.
 *
 * Two properties matter here and are the same two that matter there:
 *
 *   - what comes back is a root-relative PATH (`/objects/<bucket>/<key>`),
 *     never a presigned URL. Every prefix a listing can cover is public-read by
 *     bucket policy, so the path is stable; a signed one would be a wall of
 *     bearer credentials, some of them lapsing while the grid was on screen;
 *   - the ENDPOINT decides the scope and the owner, exactly as it decides the
 *     upload kind and the owner. A caller names a route, never a prefix, so the
 *     worst a hostile client can do is ask a route it may not read, which the
 *     backend refuses.
 */

/** One object already in the store, as a listing endpoint reports it. */
export type StoredImage = {
  /** The stable object key, e.g. `site/media/<uuid>.webp`. */
  key: string
  /** Root-relative path the image is readable at. THIS is what a form stores. */
  url: string
  sizeBytes: number
  /** ISO 8601, or undefined when the store reported no usable timestamp. */
  lastModified?: string
}

export type StoredImagePage = {
  images: StoredImage[]
  /** Pass back as `pageToken`. Empty/undefined when there is no next page. */
  nextPageToken?: string
  /**
   * The scan hit its ceiling, so `images` is a window over an unknown
   * remainder. Say so on screen: a gallery that silently stops is how someone
   * concludes their upload failed.
   */
  truncated: boolean
}

/** A listing that could not be read, carrying the message worth showing. */
export class GalleryError extends Error {}

/**
 * Ask `endpoint` what is already stored in the scope it owns.
 *
 * A 403 here is a real answer, not a bug: listing an event's media takes the
 * same permission as uploading into it, and the platform library takes the
 * global Admin role. The message comes from the backend, which is the only
 * layer that knows which rule refused.
 */
export async function fetchStoredImages(
  endpoint: string,
  options: { pageToken?: string; pageSize?: number } = {},
): Promise<StoredImagePage> {
  const url = new URL(endpoint, "http://localhost")
  if (options.pageToken) url.searchParams.set("page", options.pageToken)
  if (options.pageSize) url.searchParams.set("pageSize", String(options.pageSize))
  // Same-origin request, so only the path+query is sent — the base above exists
  // solely to let URLSearchParams do the encoding.
  const target = url.pathname + (url.search || "")

  let response: Response
  try {
    response = await fetch(target, { headers: { Accept: "application/json" } })
  } catch {
    throw new GalleryError("Could not reach the server")
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new GalleryError(text.trim() || "Could not load what is already uploaded")
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new GalleryError("Could not load what is already uploaded")
  }

  return normalizeImagePage(body)
}

/**
 * Read a listing response defensively.
 *
 * Exported for its own unit test, and separate from the fetch for the reason
 * the fetch is hard to test: this is where a renamed field would turn every
 * image into `undefined` and leave a grid of broken frames that still counts
 * the right number of them.
 */
export function normalizeImagePage(body: unknown): StoredImagePage {
  const raw = (body ?? {}) as {
    objects?: unknown
    nextPageToken?: unknown
    truncated?: unknown
  }
  const list = Array.isArray(raw.objects) ? raw.objects : []

  const images: StoredImage[] = []
  for (const entry of list) {
    const item = (entry ?? {}) as Partial<StoredImage>
    // An entry with no url cannot render and cannot be picked, so it is
    // dropped rather than shown as a hole.
    if (typeof item.url !== "string" || item.url === "") continue
    images.push({
      key: typeof item.key === "string" ? item.key : "",
      url: item.url,
      sizeBytes: Number.isFinite(Number(item.sizeBytes))
        ? Number(item.sizeBytes)
        : 0,
      ...(typeof item.lastModified === "string" && item.lastModified
        ? { lastModified: item.lastModified }
        : {}),
    })
  }

  return {
    images,
    ...(typeof raw.nextPageToken === "string" && raw.nextPageToken
      ? { nextPageToken: raw.nextPageToken }
      : {}),
    truncated: raw.truncated === true,
  }
}

/**
 * Alt text for a stored image, from its key.
 *
 * There is no filename to work from — the key is a uuid the server chose, on
 * purpose, so nothing a user typed reaches the object store. So this describes
 * WHERE it came from instead, which is the only thing the key actually says.
 * A generic alt is a poor alt; it is still better than an empty one on an
 * image someone deliberately placed in prose, and whoever placed it can edit
 * the markdown.
 */
export function altFromKey(key: string): string {
  if (key.startsWith("site/")) return "Platform page image"
  if (/^hackathons\/[^/]+\/logo\//.test(key)) return "Event logo"
  if (key.startsWith("hackathons/")) return "Event image"

  return "Uploaded image"
}

/**
 * Where an object came from, read off its key.
 *
 * The key IS the provenance record here — that is the whole point of deriving
 * the prefix from the owning entity's id (docs/storage.md, "Keys, not URLs") —
 * so nothing else has to be stored or looked up to say what a picture is.
 *
 * `hackathonId` is returned rather than a name because this module runs in the
 * browser and has no way to resolve one; the caller pairs it with a map it
 * already loaded.
 */
export type ImageOrigin = {
  /** Short label for the tile, e.g. "Event logo". */
  label: string
  /** Present for the two hackathon prefixes. */
  hackathonId?: string
}

export function originOfKey(key: string): ImageOrigin {
  const hackathon = /^hackathons\/([^/]+)\/(logo|media)\//.exec(key)
  if (hackathon) {
    return {
      label: hackathon[2] === "logo" ? "Event logo" : "Event image",
      hackathonId: hackathon[1],
    }
  }
  // The seed script writes `hackathons/seed/<slug>/cover.webp` — keyed by slug
  // rather than by id, because ids are new on every reseed and the pictures are
  // not. It matches neither shape above and is not an orphan.
  if (key.startsWith("hackathons/seed/")) return { label: "Seeded cover" }
  if (key.startsWith("hackathons/")) return { label: "Event image" }
  if (key.startsWith("site/")) return { label: "Platform page" }

  return { label: "Uploaded" }
}

/**
 * "20.5 kB". Base 10, because that is what a file manager shows and the number
 * is here to answer "is this the big one or the thumbnail".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—"
  const units = ["B", "kB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }

  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}
