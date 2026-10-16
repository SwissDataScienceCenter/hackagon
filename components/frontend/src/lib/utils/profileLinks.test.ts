import { describe, expect, it } from "vitest"
import { profileLinkKindOf, profileLinkSuggestion } from "./profileLinks"

const none = { github: "", linkedin: "", renku: "" }

describe("profileLinkKindOf", () => {
  it.each([
    ["https://github.com/octo", "github"],
    ["http://www.github.com/octo/", "github"],
    ["https://ch.linkedin.com/in/jane-doe", "linkedin"],
    ["https://linkedin.com/in/jane?trk=x", "linkedin"],
    ["https://renkulab.io/u/jane", "renku"],
  ])("recognizes %s", (href, kind) => {
    expect(profileLinkKindOf(href)).toBe(kind)
  })

  it.each([
    ["a repository, not a person", "https://github.com/octo/repo"],
    ["a LinkedIn post", "https://linkedin.com/posts/123"],
    ["a Renku project", "https://renkulab.io/p/jane/project"],
    ["another site", "https://gitlab.com/octo"],
    ["a lookalike host", "https://github.com.evil.example/octo"],
    ["not a URL", "octo"],
  ])("ignores %s", (_, href) => {
    expect(profileLinkKindOf(href)).toBeUndefined()
  })
})

describe("profileLinkSuggestion", () => {
  it("offers the first address that fits an empty link", () => {
    expect(
      profileLinkSuggestion(
        ["https://example.com", "https://github.com/octo"],
        none,
      ),
    ).toEqual({ key: "github", url: "https://github.com/octo" })
  })

  it("never offers to replace a link already set", () => {
    expect(
      profileLinkSuggestion(["https://github.com/octo"], {
        ...none,
        github: "https://github.com/someone",
      }),
    ).toBeUndefined()
  })

  it("moves on to a kind that is still empty", () => {
    expect(
      profileLinkSuggestion(
        ["https://github.com/octo", "https://renkulab.io/u/octo"],
        { ...none, github: "https://github.com/octo" },
      ),
    ).toEqual({ key: "renku", url: "https://renkulab.io/u/octo" })
  })
})
