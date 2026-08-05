// The auth guards (hooks.server.ts, (app)/+layout.server.ts) park the requested
// URL in a `returnTo` query parameter when they bounce an anonymous visitor to
// the landing page. Anything that ends up in a redirect target has to be
// validated first: only same-origin absolute paths are allowed, so the login
// flow cannot be abused as an open redirect.

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null
  // Must be a path, not an absolute URL ("https://evil.example").
  if (!value.startsWith("/")) return null
  // "//evil.example" and "/\evil.example" are read as protocol-relative URLs.
  if (value.startsWith("//") || value.startsWith("/\\")) return null

  return value
}
