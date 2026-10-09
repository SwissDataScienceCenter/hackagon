import { describe, it, expect } from "vitest"
import { nameSegments, stepMatch } from "./personSearch"

/** The name with each marked piece in brackets, for readable expectations. */
const marked = (name: string, query: string) =>
  nameSegments(name, query)
    ?.map((s) => (s.hit ? `[${s.text}]` : s.text))
    .join("") ?? null

describe("nameSegments", () => {
  it("marks a match anywhere in the name", () => {
    expect(marked("Joana Meier", "ana")).toBe("Jo[ana] Meier")
    expect(marked("Joana Meier", "meier")).toBe("Joana [Meier]")
  })

  it("ignores case", () => {
    expect(marked("Joana Meier", "JOANA")).toBe("[Joana] Meier")
  })

  it("ignores accents on either side, marking the name as written", () => {
    expect(marked("José Núñez", "jose")).toBe("[José] Núñez")
    expect(marked("Jose Nunez", "josé")).toBe("[Jose] Nunez")
    expect(marked("José Núñez", "nunez")).toBe("José [Núñez]")
  })

  it("keeps the marks in place when the name is already decomposed", () => {
    // "é" as "e" plus a combining accent: two code units, one letter.
    const name = "José Meier"
    expect(marked(name, "jose")).toBe("[José] Meier")
    expect(marked(name, "meier")).toBe("José [Meier]")
  })

  it("marks every occurrence", () => {
    expect(marked("Anna Hanna", "an")).toBe("[An]na H[an]na")
  })

  it("ignores the spaces around the query, not inside it", () => {
    expect(marked("Joana Meier", "  ana ")).toBe("Jo[ana] Meier")
    expect(marked("Joana Meier", "a m")).toBe("Joan[a M]eier")
    expect(nameSegments("Joana Meier", "joanam")).toBeNull()
  })

  it("is null for a blank query or no match", () => {
    expect(nameSegments("Joana Meier", "")).toBeNull()
    expect(nameSegments("Joana Meier", "   ")).toBeNull()
    expect(nameSegments("Joana Meier", "xyz")).toBeNull()
  })
})

describe("stepMatch", () => {
  const ids = ["a", "b", "c"]

  it("steps forward and back", () => {
    expect(stepMatch(ids, "a", 1)).toBe("b")
    expect(stepMatch(ids, "b", -1)).toBe("a")
  })

  it("wraps at either end", () => {
    expect(stepMatch(ids, "c", 1)).toBe("a")
    expect(stepMatch(ids, "a", -1)).toBe("c")
  })

  it("starts at the first going forward and the last going back", () => {
    expect(stepMatch(ids, null, 1)).toBe("a")
    expect(stepMatch(ids, null, -1)).toBe("c")
    expect(stepMatch(ids, "gone", 1)).toBe("a")
  })

  it("is null when nothing matches", () => {
    expect(stepMatch([], "a", 1)).toBeNull()
  })
})
