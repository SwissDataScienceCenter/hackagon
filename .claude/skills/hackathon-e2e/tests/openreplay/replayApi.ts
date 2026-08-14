import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { SKILL_DIR } from "../../helpers/state.js"

/*
 * The other side of the ingest endpoint: OpenReplay's own API, asked whether
 * the session it accepted bytes for actually became a RECORDING.
 *
 * Every other spec in this folder measures bytes leaving the browser, which is
 * the right measurement for a privacy claim and says nothing at all about
 * whether the far end could use them. It cannot: a batch OpenReplay's parser
 * rejects is counted, acknowledged with 200, and then discarded whole
 * (`Iterate` in backend/pkg/messages/iterator.go returns on the first parse
 * error), so the session appears in the sessions list with no recording behind
 * it and the player spins forever. That is exactly the state this rig shipped
 * in, green, for three days.
 *
 * Reading the stored artefact needs admin credentials, so this module is the
 * one place that holds them. They are minted by
 * openreplay-stack/scripts/signup.sh into a gitignored `.secrets.env` — never
 * hard-coded, never in a fixture.
 */

const SECRETS = path.join(SKILL_DIR, "..", "openreplay-stack", ".secrets.env")

export type ReplayAdmin = { baseUrl: string; jwt: string; projectId: number }

/** KEY=value, no quoting — everything after the first '=' is the value. */
function readSecrets(): Record<string, string> {
  const out: Record<string, string> = {}
  let text: string
  try {
    text = fs.readFileSync(SECRETS, "utf8")
  } catch {
    return out
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 1) continue
    out[line.slice(0, eq)] = line.slice(eq + 1)
  }

  return out
}

/**
 * The OpenReplay origin, derived from the ingest endpoint the app was wired
 * with rather than read from the skill's own `.state/tunnel-url`.
 *
 * They can disagree — the quick tunnel mints a new hostname on every restart
 * and only `wire-frontend.sh` updates the app — and if they do, the wrong one
 * is the one that did not receive the bytes. Asking the host the recording was
 * SENT to is the only choice that cannot check the wrong instance and report
 * that nothing arrived.
 */
export function replayOrigin(ingestPoint: string): string {
  return new URL(ingestPoint).origin
}

/**
 * Log in as the OpenReplay admin and resolve the project that owns
 * `projectKey`.
 *
 * Returns null when the credentials file is missing or login fails, so a
 * caller can say WHICH half of the rig is not set up instead of failing on an
 * empty token.
 */
export async function adminSession(
  ingestPoint: string,
  projectKey: string,
): Promise<ReplayAdmin | null> {
  const secrets = readSecrets()
  const email = secrets.OPENREPLAY_EMAIL
  const password = secrets.OPENREPLAY_PASSWORD
  if (!email || !password) return null

  const baseUrl = replayOrigin(ingestPoint)
  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!login.ok) return null
  const jwt = ((await login.json()) as { jwt?: string }).jwt
  if (!jwt) return null

  const projects = await fetch(`${baseUrl}/api/projects`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })
  if (!projects.ok) return null
  const listed = (await projects.json()) as {
    data?: { projectId: number; projectKey: string }[]
  }
  const project = (listed.data ?? []).find((p) => p.projectKey === projectKey)
  if (!project) return null

  return { baseUrl, jwt, projectId: project.projectId }
}

/** zstd frame magic. `storage` compresses every mob file it uploads. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

export type MobFetch =
  | { ok: true; bytes: number; compressed: boolean; body: Buffer }
  | { ok: false; status: number; detail: string }

/**
 * The stored recording as the player would read it.
 *
 * `storage` uploads mob files as a zstd frame. Node 22 can undo that in the
 * standard library, which is what makes "the invite token is not in the
 * STORED file" an assertion about the artefact rather than about the wire —
 * a leak that moved from one to the other is not a leak that was fixed.
 * Returns the raw bytes unchanged when they are not a zstd frame, so a grep
 * over the result is never silently searching a compressed buffer.
 */
export function mobPlaintext(body: Buffer): Buffer {
  if (!body.subarray(0, 4).equals(ZSTD_MAGIC)) return body
  // Added in Node 22.15; the container runs 22.22. Typed by hand because the
  // repo's @types/node predates it.
  const unzstd = (
    zlib as unknown as {
      zstdDecompressSync?: (b: Buffer) => Buffer
    }
  ).zstdDecompressSync
  if (typeof unzstd !== "function") return body

  return unzstd(body)
}

/**
 * Fetch the session's first DOM mob file — the recording itself.
 *
 * Two hops, because that is what the player does: ask the API for a presigned
 * URL (`first-mob` hands one out whether or not the object exists, so this hop
 * proves nothing on its own), then GET it. The object store answers 404
 * NoSuchKey until `storage` has uploaded, which is what makes this a poll
 * rather than a check.
 */
export async function fetchFirstMob(
  admin: ReplayAdmin,
  sessionId: string,
): Promise<MobFetch> {
  // EVERY fetch here is bounded. The rig is reached over a Cloudflare quick
  // tunnel and node's fetch has no default timeout, so one stalled request
  // inside the poll below would hang past its own deadline and surface as a
  // Playwright test timeout — which says "this test is slow", not "the
  // recording never appeared". The distinction is the whole point of the poll.
  const at = (ms = 15_000) => AbortSignal.timeout(ms)

  let res: Response
  try {
    res = await fetch(
      `${admin.baseUrl}/v2/api/${admin.projectId}/sessions/${sessionId}/first-mob`,
      { headers: { Authorization: `Bearer ${admin.jwt}` }, signal: at() },
    )
  } catch (e) {
    return { ok: false, status: 0, detail: `first-mob: ${String(e)}` }
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      detail: `first-mob: ${await res.text()}`,
    }
  }
  const payload = (await res.json()) as { data?: { domURL?: string[] } }
  const url = payload.data?.domURL?.[0]
  if (!url) {
    return { ok: false, status: 0, detail: "first-mob returned no domURL" }
  }

  let mob: Response
  try {
    mob = await fetch(url, { signal: at(30_000) })
  } catch (e) {
    return { ok: false, status: 0, detail: `mob fetch: ${String(e)}` }
  }
  if (!mob.ok) {
    return {
      ok: false,
      status: mob.status,
      detail: (await mob.text()).slice(0, 200),
    }
  }
  const body = Buffer.from(await mob.arrayBuffer())

  return {
    ok: true,
    bytes: body.length,
    compressed: body.subarray(0, 4).equals(ZSTD_MAGIC),
    body,
  }
}

/**
 * Wait for the recording to land.
 *
 * `ender` closes a session on inactivity and only then does `storage`
 * compress and upload it, so nothing exists for a minute or two after the last
 * batch. The wait is generous on purpose: a too-short poll turns "the pipeline
 * is broken" and "the pipeline is slow" into the same red, and this assertion
 * exists precisely to tell a real absence from a timing artefact.
 */
export async function waitForMob(
  admin: ReplayAdmin,
  sessionId: string,
  timeoutMs = 240_000,
): Promise<MobFetch> {
  let last: MobFetch = { ok: false, status: 0, detail: "never polled" }

  const poll = async (): Promise<MobFetch> => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      last = await fetchFirstMob(admin, sessionId)
      if (last.ok) return last
      await new Promise((r) => setTimeout(r, 5_000))
    }

    return last
  }

  // A HARD CAP, not a second belt. The loop above bounds itself and the fetches
  // inside it are bounded too, and it still outlived both — twice — leaving the
  // run to die on Playwright's test timeout instead. That reports "this test is
  // slow"; the assertion this feeds reports "the session never became a
  // recording, here is where to look". A verdict that turns into a timeout is
  // the failure telling you nothing, which is the thing this whole file exists
  // to stop happening.
  return Promise.race([
    poll(),
    new Promise<MobFetch>((resolve) =>
      setTimeout(
        () =>
          resolve({
            ok: false,
            status: 0,
            detail: `no mob after ${Math.round(timeoutMs / 1000)}s (poll did not return; last seen: ${
              last.ok ? "ok" : `${last.status} ${last.detail}`
            })`,
          }),
        timeoutMs + 30_000,
      ),
    ),
  ])
}
