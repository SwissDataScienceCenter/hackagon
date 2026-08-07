import type { RequestHandler } from "./$types"
import { env } from "$env/dynamic/private"
import { error } from "@sveltejs/kit"

/**
 * Serve `/objects/*` from the object store when nothing in front of us does.
 *
 * `/objects` is deliberately same-origin: the database stores a root-relative
 * path, so an uploaded image resolves wherever the app is reached from —
 * localhost, the tunnel, a deployment — instead of a hostname that was only
 * correct on the machine that wrote it. Serving that path was left to the edge:
 * vite proxies it in dev and caddy proxies it for the tunnel.
 *
 * The bare adapter-node server had neither, so `node build` answered 404 for
 * every uploaded image AND for every in-browser upload — the presign succeeded
 * and the PUT went nowhere. This is the fallback that makes the app correct on
 * its own.
 *
 * It is a FALLBACK, not the intended path. Whatever sits in front (caddy, an
 * ingress, a CDN) should keep serving `/objects` directly, because bytes
 * travelling through the app server is exactly what presigned URLs exist to
 * avoid. This handler exists so the absence of that proxy is a performance
 * characteristic rather than a broken feature.
 */
const STORE = env.STORAGE_ENDPOINT ?? "http://rustfs:9000"

async function forward(
  request: Request,
  path: string,
  search: string,
): Promise<Response> {
  if (path.includes("..")) error(400, "Invalid object path")

  // The signature is computed over the STORE's host and the un-prefixed path,
  // so both have to be reproduced exactly: fetch derives Host from this URL,
  // and the query string carries the signature itself.
  const target = `${STORE}/${path}${search}`

  const init: RequestInit = { method: request.method, redirect: "manual" }
  const type = request.headers.get("content-type")
  if (type) init.headers = { "content-type": type }
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Buffered rather than streamed: undici refuses a streaming body without
    // duplex, and objects here are images and attachments, not arbitrary size.
    init.body = new Uint8Array(await request.arrayBuffer())
  }

  let upstream: Response
  try {
    upstream = await fetch(target, init)
  } catch {
    error(502, "The object store is not reachable")
  }

  // Only the headers a browser needs to render or cache the object. Copying
  // everything would forward the store's own auth and server headers.
  const headers = new Headers()
  for (const h of ["content-type", "content-length", "etag", "last-modified", "cache-control"]) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }

  return new Response(upstream.body, { status: upstream.status, headers })
}

export const GET: RequestHandler = ({ request, params, url }) =>
  forward(request, params.path, url.search)

export const HEAD: RequestHandler = ({ request, params, url }) =>
  forward(request, params.path, url.search)

export const PUT: RequestHandler = ({ request, params, url }) =>
  forward(request, params.path, url.search)
