import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { ConfigLoader, mergeConfig } from "$lib/server/settings"
import { ValidationError } from "$lib/server/errors"

/**
 * The optional `config.local.yaml` overlay.
 *
 * It exists so that machine-specific wiring — the Cloudflare quick tunnel
 * above all — never has to edit the TRACKED `config.yaml`. That the tracked
 * files still say `localhost` is asserted once, on the backend side, in
 * components/backend/internal/config/config_test.go: one invariant over both
 * components' configs, in one place.
 */

const BASE = `
log:
  forceDevLog: true

backend:
  hostname: localhost
  port: 3000

cookies:
  useSecure: false

oidc:
  issuer: http://localhost:8180/realms/hackagon
  clientId: hackagon-frontend
  audience: hackagon-backend
`

const SECRETS = `
oidc:
  clientSecret: dev-client-secret
  authSecret: dev-auth-secret
`

let dir: string

function write(name: string, content: string) {
  fs.writeFileSync(path.join(dir, name), content, "utf8")
}

function load() {
  const loader = new ConfigLoader()
  loader.load(dir)

  return loader.get()
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hackagon-config-"))
  write("config.yaml", BASE)
  write("secrets.yaml", SECRETS)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("ConfigLoader with a local overlay", () => {
  it("changes nothing when the overlay is absent", () => {
    const config = load()

    expect(config.oidc.issuer).toBe("http://localhost:8180/realms/hackagon")
    expect(config.oidc.clientId).toBe("hackagon-frontend")
  })

  it("lets a partial overlay override one key without wiping its siblings", () => {
    // Exactly what auth-wire.sh writes: the issuer and nothing else.
    write(
      "config.local.yaml",
      `
oidc:
  issuer: https://example-tunnel.trycloudflare.com/realms/hackagon
`,
    )

    const config = load()

    expect(config.oidc.issuer).toBe(
      "https://example-tunnel.trycloudflare.com/realms/hackagon",
    )
    // A shallow merge would have dropped these and the config would fail
    // validation for keys the overlay never mentioned.
    expect(config.oidc.clientId).toBe("hackagon-frontend")
    expect(config.oidc.audience).toBe("hackagon-backend")
    // Sections the overlay never named are untouched.
    expect(config.backend.hostname).toBe("localhost")
    expect(config.backend.port).toBe(3000)
    expect(config.cookies.useSecure).toBe(false)
  })

  it("validates the MERGED result, so the overlay cannot smuggle in a bad value", () => {
    write("config.local.yaml", "oidc:\n  issuer: not-a-url\n")

    expect(() => load()).toThrow(ValidationError)
  })

  it("refuses a malformed overlay rather than ignoring it", () => {
    // Silently skipping it would mean the override stops applying with
    // nothing to say so — the failure mode this whole mechanism replaces.
    write("config.local.yaml", "oidc: [not a mapping\n")

    expect(() => load()).toThrow()
  })
})

describe("mergeConfig", () => {
  it("recurses into nested objects", () => {
    expect(mergeConfig({ a: { b: 1, c: 2 } }, { a: { c: 3 } })).toEqual({
      a: { b: 1, c: 3 },
    })
  })

  it("replaces arrays and scalars instead of merging them", () => {
    expect(mergeConfig({ a: [1, 2, 3], b: "x" }, { a: [9], b: "y" })).toEqual({
      a: [9],
      b: "y",
    })
  })

  it("adds keys the base does not have", () => {
    expect(mergeConfig({ a: 1 }, { b: { c: 2 } })).toEqual({
      a: 1,
      b: { c: 2 },
    })
  })

  it("does not let a __proto__ key reach the prototype chain", () => {
    const merged = mergeConfig({ a: 1 }, JSON.parse('{"__proto__":{"bad":1}}'))

    expect(merged).toEqual({ a: 1 })
    expect(({} as Record<string, unknown>).bad).toBeUndefined()
  })
})
