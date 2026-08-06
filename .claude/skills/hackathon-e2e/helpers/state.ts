import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** Runtime state shared between scripts and tests: storage states, the
 * capability probe result, and the journey recipe's cross-act state. */
export const SKILL_DIR = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
)
export const STATE_DIR = path.join(SKILL_DIR, ".state")

export function ensureStateDir(): void {
  fs.mkdirSync(STATE_DIR, { recursive: true })
}

/** Playwright storageState file for a persona (written by tests/auth.setup.ts). */
export function storageStatePath(key: PersonaKey): string {
  return path.join(STATE_DIR, `${key}.json`)
}

// ─── Journey cross-act state ─────────────────────────────────────────────────
// The journey suite is one recipe spread over act files that run serially in
// one worker. Acts pass data (the created hackathon's id, resolved user ids)
// through this JSON file so each act stays a self-contained spec.

export interface JourneyState {
  hackathonId: string
  hackathonName: string
  /** Backend DB user UUIDs (not Keycloak IDs) by username, resolved via WhoAmI. */
  userIds: Record<string, string>
}

const JOURNEY_STATE = path.join(STATE_DIR, "journey.json")

export function readJourneyState(): JourneyState | null {
  try {
    return JSON.parse(fs.readFileSync(JOURNEY_STATE, "utf8")) as JourneyState
  } catch {
    return null
  }
}

export function writeJourneyState(state: JourneyState): void {
  ensureStateDir()
  fs.writeFileSync(JOURNEY_STATE, JSON.stringify(state, null, 2))
}

export function clearJourneyState(): void {
  fs.rmSync(JOURNEY_STATE, { force: true })
}
