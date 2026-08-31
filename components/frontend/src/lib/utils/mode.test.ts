import { describe, it, expect } from "vitest"
import { resolveMode, storedMode } from "./mode"

describe("storedMode", () => {
  it("accepts only the two real modes", () => {
    expect(storedMode("light")).toBe("light")
    expect(storedMode("dark")).toBe("dark")
  })

  it("rejects anything else, so a stale or hand-edited value cannot win", () => {
    // `mode` is written by us but read from storage the visitor can edit, and a
    // junk value must fall through to the system rather than to a broken theme.
    for (const raw of [null, undefined, "", "DARK", "auto", "system", "true"]) {
      expect(storedMode(raw)).toBeNull()
    }
  })
})

describe("resolveMode", () => {
  it("honours an explicit choice over the system preference", () => {
    // Both directions: the point is that the stored value wins, not that light
    // or dark wins.
    expect(resolveMode("light", true)).toBe("light")
    expect(resolveMode("dark", false)).toBe("dark")
  })

  it("follows the browser when nothing has been chosen", () => {
    expect(resolveMode(null, true)).toBe("dark")
    expect(resolveMode(null, false)).toBe("light")
  })

  it("falls back to light when the browser states no preference", () => {
    // `prefers-color-scheme: dark` not matching is what a light or unset
    // preference both look like, and light is the mode datascience.ch serves.
    expect(resolveMode(null, false)).toBe("light")
    expect(resolveMode("nonsense", false)).toBe("light")
  })
})
