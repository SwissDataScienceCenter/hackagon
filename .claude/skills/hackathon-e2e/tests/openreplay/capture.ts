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

const CONFIG_DIR = path.join(FRONTEND, "data", "test", "config")

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8")
  } catch {
    return null
  }
}

/**
 * The scalar entries of one top-level YAML block, or null when there is no
 * such block.
 *
 * Deliberately not a YAML parser: this package has no yaml dependency, the
 * block is flat, and it is written by one script
 * (openreplay-stack/scripts/wire-frontend.sh) whose shape is known. The block
 * ends where the next column-0 key begins, which is exactly the rule
 * `.claude/skills/lib/config-overlay.sh` writes to.
 */
function blockScalars(
  text: string | null,
  key: string,
): Record<string, string> | null {
  if (text === null) return null
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith(`${key}:`))
  if (start === -1) return null

  const out: Record<string, string> = {}
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[^\s#]/.test(lines[i])) break
    const m = lines[i].match(/^\s+([A-Za-z_][A-Za-z0-9_]*):\s*"?([^"#]*?)"?\s*$/)
    if (m) out[m[1]] = m[2]
  }

  return out
}

/**
 * The frontend's replay block, or null when replay is off.
 *
 * Read out of the config files rather than out of the page, because every spec
 * in this folder self-skips when the rig is not wired and a skip decision has
 * to be available before a browser exists.
 *
 * READS THE MERGED VIEW, config.yaml overlaid with config.local.yaml, because
 * that is what the server reads (`mergeConfig` in
 * components/frontend/src/lib/server/settings.ts). Wiring writes the gitignored
 * OVERLAY — the tracked config.yaml must never carry a `*.trycloudflare.com`
 * ingest hostname that dies in a few hours — so a reader that only looked at
 * config.yaml would find `enabled` absent on a perfectly well-wired machine,
 * every spec here would `test.skip`, and the suite would report green having
 * verified nothing about masking, consent or Do Not Track. A skip is the one
 * outcome this folder must never reach by accident.
 */
export function replayConfig(): ReplayConfig | null {
  const base = blockScalars(read(path.join(CONFIG_DIR, "config.yaml")), "replay")
  const local = blockScalars(
    read(path.join(CONFIG_DIR, "config.local.yaml")),
    "replay",
  )
  if (base === null && local === null) return null

  // Same precedence as the loader: the overlay wins key by key, so an overlay
  // saying `enabled: false` turns off a base that says true.
  const replay = { ...(base ?? {}), ...(local ?? {}) }
  if (replay.enabled !== "true") return null
  const { ingestPoint, projectKey } = replay

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
