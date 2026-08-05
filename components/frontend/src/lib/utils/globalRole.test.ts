import { describe, expect, it } from "vitest"
import {
  displayableGlobalRoles,
  globalRoleBadgeVariant,
  globalRoleLabel,
} from "./globalRole"

// GlobalRole numeric values.
const UNSPECIFIED = 0
const ADMIN = 1
const HACKATHON_ORGANIZER = 2

describe("displayableGlobalRoles", () => {
  it("is empty for someone holding no global role", () => {
    expect(displayableGlobalRoles([])).toEqual([])
  })

  it("keeps the roles it can name", () => {
    expect(displayableGlobalRoles([ADMIN, HACKATHON_ORGANIZER])).toEqual([
      ADMIN,
      HACKATHON_ORGANIZER,
    ])
  })

  // UNSPECIFIED is a real value the proto can carry, and it names nothing a
  // viewer could act on — a badge for it would read as a rendering fault.
  it("drops UNSPECIFIED", () => {
    expect(displayableGlobalRoles([UNSPECIFIED, ADMIN])).toEqual([ADMIN])
  })

  // A newer backend can grant a role this build has no label for. Better to
  // omit it than to show the viewer a badge saying "Unknown" about themselves.
  it("drops a role this build cannot name", () => {
    expect(displayableGlobalRoles([ADMIN, 99])).toEqual([ADMIN])
  })

  // The order is the display order, not the order casbin happened to return —
  // otherwise the badges could swap places between two renders of the same page.
  it("pins the order regardless of the input order", () => {
    expect(displayableGlobalRoles([HACKATHON_ORGANIZER, ADMIN])).toEqual([
      ADMIN,
      HACKATHON_ORGANIZER,
    ])
  })

  // The dashboard renders `globalRoleLabel` for each entry without a fallback,
  // so every role this returns has to have both a label and a badge variant.
  it("returns only roles that have a label and a variant", () => {
    for (const role of displayableGlobalRoles([
      UNSPECIFIED,
      ADMIN,
      HACKATHON_ORGANIZER,
      99,
    ])) {
      expect(globalRoleLabel(role), `role ${role} has no label`).toBeTruthy()
      expect(
        globalRoleBadgeVariant(role),
        `role ${role} has no badge variant`,
      ).toBeTruthy()
    }
  })
})
