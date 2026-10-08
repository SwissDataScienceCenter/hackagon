import { describe, it, expect } from "vitest"
import { initialsOf } from "./teamDistribution"

describe("initialsOf", () => {
  it("takes the initial of each word", () => {
    expect(initialsOf("AutoML Pipeline Builder")).toBe("APB")
  })

  it("falls back rather than returning nothing", () => {
    expect(initialsOf("   ")).toBe("?")
  })
})
