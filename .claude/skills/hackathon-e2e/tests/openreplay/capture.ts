import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import type { BrowserContext, Page, Request } from "@playwright/test"
import { SKILL_DIR } from "../../helpers/state.js"

/*
 * Shared plumbing for the session-replay specs: read the replay config,
 * intercept the tracker's ingest traffic, and grep the raw bytes.
 *
 * Not a `.spec.ts`, so the `openreplay` project's testMatch never picks it up
 * as a suite of its own.
 */

export const ARTIFACTS = path.join(SKILL_DIR, ".artifacts", "openreplay")
export const FRONTEND = path.join(
  SKILL_DIR,
  "..",
  "..",
  "..",
  "components",
  "frontend",
)

/** Must match REPLAY_CONSENT_COOKIE in $lib/utils/replayConsent. */
export const CONSENT_COOKIE = "hackagon_replay_consent"

export type ReplayConfig = { ingestPoint: string; projectKey: string }

/**
 * The frontend's replay block, or null when replay is off.
 *
 * Read out of config.yaml rather than out of the page, because every spec in
 * this folder self-skips when the rig is not wired and a skip decision has to
 * be available before a browser exists.
 */
export function replayConfig(): ReplayConfig | null {
  const cfg = path.join(FRONTEND, "data", "test", "config", "config.yaml")
  let text: string
  try {
    text = fs.readFileSync(cfg, "utf8")
  } catch {
    return null
  }
  if (!/^\s*enabled:\s*true\s*$/m.test(text)) return null
  const ingestPoint = text.match(/^\s*ingestPoint:\s*"?([^"\s]+)"?\s*$/m)?.[1]
  const projectKey = text.match(/^\s*projectKey:\s*"?([^"\s]+)"?\s*$/m)?.[1]

  return ingestPoint && projectKey ? { ingestPoint, projectKey } : null
}

/**
 * Collect every byte the page posts to the ingest endpoint.
 *
 * `postDataBuffer()` and not `postData()`: the tracker's batches are a binary
 * message stream, and reading them as a string would re-encode invalid UTF-8
 * and could destroy the very bytes we are searching for.
 */
export function captureIngest(page: Page): { chunks: Buffer[] } {
  const chunks: Buffer[] = []
  const onRequest = (req: Request) => {
    if (!req.url().includes("/ingest")) return
    const body = req.postDataBuffer()
    if (body) chunks.push(body)
  }
  page.on("request", onRequest)

  return { chunks }
}

export function writeCapture(name: string, chunks: Buffer[]): string {
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  const file = path.join(ARTIFACTS, `${name}.bin`)
  fs.writeFileSync(file, Buffer.concat(chunks))

  return file
}

/**
 * Case-sensitive raw-byte search — the sentinels are pure ASCII.
 *
 * Every chunk is searched raw AND, when it turns out to be gzip, inflated
 * first: the tracker compresses a batch once it exceeds ~24 kB, and a grep
 * that only reads the raw bytes would report "not found" for a sentinel that
 * was transmitted perfectly well, just deflated. Exactly the false green this
 * folder is built to avoid, in the direction that matters.
 */
export function contains(chunks: Buffer[], needle: string): boolean {
  const target = Buffer.from(needle, "utf8")
  if (Buffer.concat(chunks).includes(target)) return true

  return chunks.some((c) => {
    try {
      return zlib.gunzipSync(c).includes(target)
    } catch {
      return false
    }
  })
}

export function bytes(chunks: Buffer[]): number {
  return Buffer.concat(chunks).length
}

/**
 * Pre-set the consent cookie for specs that are about something else.
 *
 * The consent spec itself never uses this — it clicks the real banner, because
 * a test that fakes the mechanism it is verifying proves nothing about it.
 * Here it stands in for "this visitor already said yes", which is a
 * precondition for the masking spec rather than its subject.
 */
export async function grantConsent(
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  const url = new URL(baseURL)
  await context.addCookies([
    {
      name: CONSENT_COOKIE,
      value: "granted",
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ])
}
