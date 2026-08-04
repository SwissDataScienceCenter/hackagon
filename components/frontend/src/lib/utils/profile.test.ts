import { describe, it, expect } from "vitest"
import {
  globalRoleBadges,
  globalRoleLabel,
  profileDisplayName,
  profileInitials,
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
