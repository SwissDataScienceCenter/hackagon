import fs from "node:fs"
import path from "node:path"
import type { TestType } from "@playwright/test"
import { STATE_DIR } from "./state.js"

// scripts/probe.sh writes .state/capabilities.json by safely probing the
// running backend (unauthenticated calls: implemented handlers reject with
// Unauthenticated/PermissionDenied before touching the DB; missing ones
// return Unimplemented or an unknown-service reflection error).
//
// Journey acts gate themselves on this file, so the lifecycle recipe grows
// automatically as your coworker lands write-path handlers: the day an RPC
// stops returning Unimplemented, its act stops skipping.

interface CapabilitiesFile {
  generatedAt?: string
  methods?: Record<string, boolean>
}

let cached: CapabilitiesFile | null = null

function load(): CapabilitiesFile {
  if (cached) return cached
  try {
    cached = JSON.parse(
      fs.readFileSync(path.join(STATE_DIR, "capabilities.json"), "utf8"),
    ) as CapabilitiesFile
  } catch {
    cached = {}
  }
  return cached
}

export function implemented(method: string): boolean {
  return load().methods?.[method] === true
}

/**
 * Was this method probed at all?
 *
 * `implemented()` cannot tell "the backend returned Unimplemented" from "no
 * one ever asked" — both are falsy — so a recipe action naming a method that
 * is missing from probe.sh's METHODS list skips forever and reports green.
 * Six actions did exactly that on first run. Callers use this to fail loudly
 * on the second case, which is a gap in the probe list and not in the backend.
 */
export function probed(method: string): boolean {
  return method in (load().methods ?? {})
}

/**
 * Call as the first line of a journey test. Skips the test (with an
 * actionable message) when the backend does not implement the given RPCs yet.
 * When a gate opens, the placeholder body below it will fail loudly — that is
 * intentional: it forces the act to be scripted the moment the feature lands.
 */
export function skipUnlessImplemented(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  test: TestType<any, any>,
  ...methods: string[]
): void {
  const file = load()
  test.skip(
    !file.methods,
    "No .state/capabilities.json — run scripts/probe.sh (or scripts/run.sh) first",
  )
  const missing = methods.filter((m) => !implemented(m))
  test.skip(
    missing.length > 0,
    `Backend does not implement yet: ${missing.join(", ")}`,
  )
}
