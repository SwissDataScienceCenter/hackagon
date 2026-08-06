import { describe, it, expect } from "vitest"
import { canEditHackathon, hackathonRoleBadge } from "./hackathonRole"

// HackathonRole numeric values.
const ROLE_UNSPECIFIED = 0
const ROLE_OWNER = 1
const ROLE_MEMBER = 2

describe("hackathonRoleBadge", () => {
  it("labels an owner", () => {
    expect(
      hackathonRoleBadge({ role: ROLE_OWNER, isWaiting: false }, false),
    ).toBe("Owner")
  })

  it("labels a member", () => {
    expect(
      hackathonRoleBadge({ role: ROLE_MEMBER, isWaiting: false }, false),
    ).toBe("Member")
  })

  it("prefers Waitlisted over the casbin role", () => {
    // A waitlisted user can hold no role yet, but the same must hold if the
    // backend ever reports both: not-yet-approved is the more important fact.
    expect(
      hackathonRoleBadge({ role: ROLE_MEMBER, isWaiting: true }, false),
    ).toBe("Waitlisted")
  })

  it("badges a global admin who is not a participant", () => {
    expect(hackathonRoleBadge(undefined, true)).toBe("Admin")
  })

  it("prefers Owner over Admin for an admin who owns the hackathon", () => {
    // Owner is the more specific of the two, and it is the one that explains
    // why this particular hackathon is theirs to manage.
    expect(
      hackathonRoleBadge({ role: ROLE_OWNER, isWaiting: false }, true),
    ).toBe("Owner")
  })

  it("has no badge for someone with no relationship to the hackathon", () => {
    expect(hackathonRoleBadge(undefined, false)).toBeUndefined()
    expect(
      hackathonRoleBadge({ role: ROLE_UNSPECIFIED, isWaiting: false }, false),
    ).toBeUndefined()
  })
})

describe("canEditHackathon", () => {
  it("admits the confirmed owner", () => {
    expect(
      canEditHackathon({ role: ROLE_OWNER, isWaiting: false }, false),
    ).toBe(true)
  })

  it("refuses a waitlisted owner", () => {
    // Not-yet-approved is the more important fact, same rule hackathonRoleBadge
    // applies to the badge.
    expect(canEditHackathon({ role: ROLE_OWNER, isWaiting: true }, false)).toBe(
      false,
    )
  })

  it("refuses a plain member", () => {
    expect(
      canEditHackathon({ role: ROLE_MEMBER, isWaiting: false }, false),
    ).toBe(false)
  })

  it("admits a global admin with no membership row", () => {
    expect(canEditHackathon(undefined, true)).toBe(true)
  })

  it("refuses someone with no relationship to the hackathon", () => {
    expect(canEditHackathon(undefined, false)).toBe(false)
  })
})
