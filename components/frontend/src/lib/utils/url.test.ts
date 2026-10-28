import { describe, it, expect } from "vitest"
import { isHttpUrl, isHttpsUrl } from "./url"

describe("isHttpUrl", () => {
  it("accepts http and https", () => {
    expect(isHttpUrl("http://example.org")).toBe(true)
    expect(isHttpUrl("https://example.org")).toBe(true)
  })

  it("refuses notes and other schemes", () => {
    expect(isHttpUrl("see our repo")).toBe(false)
    expect(isHttpUrl("javascript:alert(1)")).toBe(false)
  })
})

describe("isHttpsUrl", () => {
  it("accepts an absolute https URL", () => {
    expect(isHttpsUrl("https://github.com/byte-me/floods")).toBe(true)
  })

  it("refuses plain http, which the backend refuses too", () => {
    expect(isHttpsUrl("http://github.com/byte-me/floods")).toBe(false)
  })

  it("refuses a link without a scheme", () => {
    expect(isHttpsUrl("github.com/byte-me/floods")).toBe(false)
  })

  it("refuses notes", () => {
    expect(isHttpsUrl("Repo is private, ask us")).toBe(false)
  })
})
