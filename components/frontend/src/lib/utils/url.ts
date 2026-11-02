/**
 * Whether a string can be rendered as a link.
 *
 * A submission's repository link was free text until the backend started
 * requiring https, so an older version may hold notes or a bare repo name.
 * Linkifying only what parses as http(s) keeps those from becoming dead links,
 * and keeps a `javascript:`/`data:` string out of an `href`.
 *
 * Every page that shows a submission renders it through `SubmissionContent`,
 * so they all make the same call about it.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Whether the backend will accept a string as a submission link.
 *
 * Mirrors `requireHTTPSURL` in the backend's `urls.go`: an absolute URL with
 * the https scheme and a host. Checked here first so a refusal can name the
 * field the person typed into, rather than the proto field the backend names.
 */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.host !== ""
  } catch {
    return false
  }
}
