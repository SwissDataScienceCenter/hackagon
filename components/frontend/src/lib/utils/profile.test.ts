import { describe, it, expect } from "vitest"
import {
  AFFILIATION_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  globalRoleBadges,
  globalRoleLabel,
  profileDisplayName,
  profileInitials,
  URL_MAX_LENGTH,
  validateProfileDraft,
} from "./profile"

// GlobalRole numeric values.
const ROLE_UNSPECIFIED = 0
const ROLE_ADMIN = 1
const ROLE_ORGANIZER = 2

describe("globalRoleLabel", () => {
  it("names the roles it knows", () => {
    expect(globalRoleLabel(ROLE_ADMIN)).toBe("Admin")
    expect(globalRoleLabel(ROLE_ORGANIZER)).toBe("Organiser")
  })

  it("returns undefined for UNSPECIFIED and unknown values", () => {
    expect(globalRoleLabel(ROLE_UNSPECIFIED)).toBeUndefined()
    expect(globalRoleLabel(99)).toBeUndefined()
  })
})

describe("globalRoleBadges", () => {
  it("keeps order and pairs each label with a preset", () => {
    expect(globalRoleBadges([ROLE_ADMIN, ROLE_ORGANIZER])).toEqual([
      { label: "Admin", preset: "preset-tonal-tertiary" },
      { label: "Organiser", preset: "preset-tonal-primary" },
    ])
  })

  // A badge reading "Unknown" next to someone's name is worse than no badge, so
  // a role this build has no name for is dropped rather than labelled.
  it("drops unnamed roles instead of labelling them", () => {
    expect(globalRoleBadges([ROLE_UNSPECIFIED, ROLE_ADMIN, 99])).toEqual([
      { label: "Admin", preset: "preset-tonal-tertiary" },
    ])
  })

  it("returns nothing for a user with no roles", () => {
    expect(globalRoleBadges([])).toEqual([])
  })
})

describe("profileInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(profileInitials("Alice Weber", "alice")).toBe("AW")
    expect(profileInitials("Ada Byron Lovelace", "ada")).toBe("AB")
  })

  it("falls back to the username when display name is blank", () => {
    expect(profileInitials("", "bob")).toBe("B")
    expect(profileInitials("   ", "bob")).toBe("B")
    expect(profileInitials(undefined, "bob")).toBe("B")
  })

  // Never an empty circle: that reads as a rendering fault rather than a missing
  // name.
  it("returns '?' when both are blank", () => {
    expect(profileInitials("", "")).toBe("?")
    expect(profileInitials(undefined, undefined)).toBe("?")
  })

  it("uppercases and ignores extra whitespace", () => {
    expect(profileInitials("  alice   weber  ", "alice")).toBe("AW")
  })
})

describe("profileDisplayName", () => {
  it("prefers the display name, falling back to the username", () => {
    expect(profileDisplayName("Alice Weber", "alice")).toBe("Alice Weber")
    expect(profileDisplayName("", "alice")).toBe("alice")
    expect(profileDisplayName("   ", "alice")).toBe("alice")
    expect(profileDisplayName(undefined, "alice")).toBe("alice")
  })

  it("never renders an empty name", () => {
    expect(profileDisplayName(undefined, undefined)).toBe("Unknown user")
    expect(profileDisplayName("", "")).toBe("Unknown user")
  })
})

describe("validateProfileDraft", () => {
  const ok = {
    affiliation: "ETH Zürich",
    title: "Engineer",
    description: "Hi",
    linkedinUrl: "https://www.linkedin.com/in/example",
  }

  it("accepts a filled-in draft", () => {
    expect(validateProfileDraft(ok)).toEqual({})
  })

  // Every profile field is optional, and clearing one is a legitimate edit.
  it("accepts an entirely empty draft", () => {
    expect(
      validateProfileDraft({
        affiliation: "",
        title: "",
        description: "",
        linkedinUrl: "",
      }),
    ).toEqual({})
  })

  it("accepts values exactly at the limit", () => {
    expect(
      validateProfileDraft({
        ...ok,
        affiliation: "a".repeat(AFFILIATION_MAX_LENGTH),
        description: "d".repeat(DESCRIPTION_MAX_LENGTH),
      }),
    ).toEqual({})
  })

  it("reports the field that is too long", () => {
    const errors = validateProfileDraft({
      ...ok,
      affiliation: "a".repeat(AFFILIATION_MAX_LENGTH + 1),
    })
    expect(Object.keys(errors)).toEqual(["affiliation"])
    expect(errors.affiliation).toContain(String(AFFILIATION_MAX_LENGTH))
  })

  it("reports every bad field at once rather than the first", () => {
    const errors = validateProfileDraft({
      affiliation: "a".repeat(AFFILIATION_MAX_LENGTH + 1),
      title: "t".repeat(AFFILIATION_MAX_LENGTH + 1),
      description: "d".repeat(DESCRIPTION_MAX_LENGTH + 1),
      linkedinUrl: "not-a-url",
    })
    expect(Object.keys(errors).sort()).toEqual([
      "affiliation",
      "description",
      "linkedinUrl",
      "title",
    ])
  })

  describe("linkedinUrl", () => {
    const withUrl = (linkedinUrl: string) =>
      validateProfileDraft({ ...ok, linkedinUrl })

    it("accepts http and https", () => {
      expect(withUrl("https://example.com/in/me")).toEqual({})
      expect(withUrl("http://example.com/in/me")).toEqual({})
    })

    it("rejects a bare domain with no scheme", () => {
      expect(withUrl("www.linkedin.com/in/me").linkedinUrl).toBeDefined()
    })

    // The value lands in an href, so refusing the scheme matters more than the
    // shape of the rest.
    it("rejects non-http schemes", () => {
      expect(withUrl("javascript:alert(1)").linkedinUrl).toBeDefined()
      expect(withUrl("data:text/html,hi").linkedinUrl).toBeDefined()
      expect(withUrl("ftp://example.com").linkedinUrl).toBeDefined()
    })

    it("rejects a URL over the length limit", () => {
      const long = `https://example.com/${"a".repeat(URL_MAX_LENGTH)}`
      expect(withUrl(long).linkedinUrl).toContain(String(URL_MAX_LENGTH))
    })
  })
})
