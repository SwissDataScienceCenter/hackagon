import { describe, it, expect } from "vitest"
import {
  canEditHackathon,
  canManageHackathon,
  hackathonRoleBadge,
  membershipBadgeLabel,
  membershipBadgeVariant,
} from "./hackathonRole"

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

describe("canManageHackathon", () => {
  it("admits the owner", () => {
    expect(
      canManageHackathon({ role: ROLE_OWNER, isWaiting: false }, false),
    ).toBe(true)
  })

  // The one place this parts company with canEditHackathon, and deliberately:
  // the backend does not consult `isWaiting` for phase:write, page:write or
  // track:write either, so a waitlisted owner reaches Settings and is refused
  // only by the narrower rule, on the one form that needs it.
  it("admits a waitlisted owner, unlike canEditHackathon", () => {
    expect(
      canManageHackathon({ role: ROLE_OWNER, isWaiting: true }, false),
    ).toBe(true)
    expect(canEditHackathon({ role: ROLE_OWNER, isWaiting: true }, false)).toBe(
      false,
    )
  })

  it("refuses a plain member", () => {
    expect(
      canManageHackathon({ role: ROLE_MEMBER, isWaiting: false }, false),
    ).toBe(false)
  })

  it("admits a global admin with no membership row", () => {
    expect(canManageHackathon(undefined, true)).toBe(true)
  })

  it("refuses someone with no relationship to the hackathon", () => {
    expect(canManageHackathon(undefined, false)).toBe(false)
  })
})

// These two moved here from hackathonStatus.ts, which had HackathonRole's
// numeric values hard-coded a second time. They arrived untested, and the reason
// they are not simply `hackathonRoleBadge` is the part worth pinning.
describe("membershipBadgeLabel", () => {
  it("prefers Waitlisted over the role, as hackathonRoleBadge does", () => {
    expect(membershipBadgeLabel(true, ROLE_OWNER)).toBe("Waitlisted")
  })

  it("labels an owner", () => {
    expect(membershipBadgeLabel(false, ROLE_OWNER)).toBe("Owner")
  })

  // Deliberately not undefined the way hackathonRoleBadge is: this chip only
  // renders where a membership row is already known to exist, so it always
  // returns a string and an unrecognized role still reads as a participant.
  // It names no global role either — on the dashboard "Admin" would appear
  // against every hackathon on the platform and say nothing about any one.
  it("falls back to Member rather than going blank", () => {
    expect(membershipBadgeLabel(false, ROLE_MEMBER)).toBe("Member")
    expect(membershipBadgeLabel(false, ROLE_UNSPECIFIED)).toBe("Member")
  })
})

describe("membershipBadgeVariant", () => {
  // A lifecycle state, so a status hue either way and never the accent.
  it("separates waiting from confirmed", () => {
    expect(membershipBadgeVariant(true)).toBe("badge-warning")
    expect(membershipBadgeVariant(false)).toBe("badge-success")
  })
})
