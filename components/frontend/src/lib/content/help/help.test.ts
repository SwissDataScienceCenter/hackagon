import { describe, expect, it } from "vitest"
import { HELP } from "./index"

// Every component, read as text, to find the topics pages ask for. The lint
// step's `tsc` does not look inside `.svelte` files, so this is what catches a
// mistyped topic in CI.
const SOURCES = import.meta.glob<string>("/src/**/*.svelte", {
  query: "?raw",
  import: "default",
  eager: true,
})

const used = new Set(
  Object.values(SOURCES).flatMap((src) =>
    [
      ...src.matchAll(/<(?:InfoButton|PageHeader)[^>]*\btopic="([^"]+)"/g),
    ].flatMap((m) => (m[1] ? [m[1]] : [])),
  ),
)

describe("help texts", () => {
  it("finds the topics pages use", () => {
    expect(used.size).toBeGreaterThan(0)
  })

  it("has a file for every topic a page uses", () => {
    for (const topic of used) {
      expect(HELP, `no ${topic}.md in $lib/content/help`).toHaveProperty(topic)
    }
  })

  // A file nothing renders is wording someone may edit without effect.
  it("has no file that no page uses", () => {
    for (const topic of Object.keys(HELP)) {
      expect(used, `${topic}.md is not used by any page`).toContain(topic)
    }
  })

  it("has no empty file", () => {
    for (const [topic, text] of Object.entries(HELP)) {
      expect(text.trim(), `${topic}.md is empty`).not.toBe("")
    }
  })
})
