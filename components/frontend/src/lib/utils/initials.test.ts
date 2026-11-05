import { describe, it, expect } from "vitest"
import { avatarInitials } from "./initials"

describe("avatarInitials", () => {
  it("takes the first letter of each word", () => {
    expect(avatarInitials("Document Summarizer")).toBe("DS")
  })

  it("keeps two letters at most", () => {
    expect(avatarInitials("AutoML Pipeline Builder")).toBe("AP")
  })

  it("upper-cases them", () => {
    expect(avatarInitials("dana okonkwo")).toBe("DO")
  })

  it("gives one letter for one word", () => {
    expect(avatarInitials("Chatbot")).toBe("C")
  })

  it("ignores repeated and surrounding whitespace", () => {
    expect(avatarInitials("  Team   Alpha ")).toBe("TA")
  })

  it("gives nothing for an empty name", () => {
    expect(avatarInitials("")).toBe("")
  })
})
