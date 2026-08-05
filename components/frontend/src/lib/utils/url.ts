/**
 * Whether a string can be rendered as a link.
 *
 * A submission's `result` is free text — the schema says "e.g. a URL" but
 * nothing enforces it — so a team may have typed notes, or a bare repo name.
 * Linkifying only what parses as http(s) keeps a description from becoming a
 * dead link, and keeps a `javascript:`/`data:` string out of an `href`.
 *
 * Shared by the submissions page and the team card: both render the same
 * `result`, so both have to make the same call about it.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
