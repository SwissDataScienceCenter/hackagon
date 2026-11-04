import { describe, expect, it } from "vitest"
import {
  ASSIGNABLE_GLOBAL_ROLES,
  GLOBAL_ROLE_FILTERS,
  NO_PLATFORM_ROLE,
  PLATFORM_ROLE_CHOICES,
  currentPlatformRole,
  displayableGlobalRoles,
  globalRoleBadgeVariant,
  globalRoleFilterLabel,
  globalRoleLabel,
  matchesGlobalRoleFilter,
  planPlatformRoleChange,
  platformRoleChoiceLabel,
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

describe("GLOBAL_ROLE_FILTERS", () => {
  // Adding a role to ASSIGNABLE_GLOBAL_ROLES has to give it a filter, or its
  // holders could only be found under "All".
  it("offers a slice for every assignable role", () => {
    for (const role of ASSIGNABLE_GLOBAL_ROLES) {
      expect(GLOBAL_ROLE_FILTERS).toContain(role)
    }
  })

  it("opens on everyone and closes on no role", () => {
    expect(GLOBAL_ROLE_FILTERS[0]).toBe("all")
    expect(GLOBAL_ROLE_FILTERS.at(-1)).toBe("none")
  })

  it("labels every slice", () => {
    for (const filter of GLOBAL_ROLE_FILTERS) {
      expect(globalRoleFilterLabel(filter)).not.toBe("Unknown")
    }
  })
})

describe("matchesGlobalRoleFilter", () => {
  it("lets everyone through all", () => {
    expect(matchesGlobalRoleFilter([], "all")).toBe(true)
    expect(matchesGlobalRoleFilter([ADMIN], "all")).toBe(true)
    expect(matchesGlobalRoleFilter([99], "all")).toBe(true)
  })

  it("matches the holders of a role", () => {
    expect(matchesGlobalRoleFilter([ADMIN], ADMIN)).toBe(true)
    expect(matchesGlobalRoleFilter([HACKATHON_ORGANIZER], ADMIN)).toBe(false)
    expect(matchesGlobalRoleFilter([], ADMIN)).toBe(false)
  })

  // The roles are exclusive in the UI but not in the API, so a user granted
  // both out of band has to turn up under each — the table shows both badges.
  it("matches a user holding both roles under each", () => {
    expect(matchesGlobalRoleFilter([ADMIN, HACKATHON_ORGANIZER], ADMIN)).toBe(
      true,
    )
    expect(
      matchesGlobalRoleFilter(
        [ADMIN, HACKATHON_ORGANIZER],
        HACKATHON_ORGANIZER,
      ),
    ).toBe(true)
  })

  it("matches no role only for an empty role list", () => {
    expect(matchesGlobalRoleFilter([], "none")).toBe(true)
    expect(matchesGlobalRoleFilter([ADMIN], "none")).toBe(false)
  })

  // Their row shows an "Unknown" badge rather than a dash, so they are not what
  // the "None" platform-role filter promises.
  it("keeps a user holding only an unnamed role out of no role", () => {
    expect(matchesGlobalRoleFilter([99], "none")).toBe(false)
  })
})

describe("PLATFORM_ROLE_CHOICES", () => {
  it("offers none and every assignable role", () => {
    expect([...PLATFORM_ROLE_CHOICES].sort()).toEqual(
      [NO_PLATFORM_ROLE, ...ASSIGNABLE_GLOBAL_ROLES].sort(),
    )
  })

  // Least power first, so Admin is the last thing on the ladder.
  it("ends on Admin", () => {
    expect(PLATFORM_ROLE_CHOICES.at(-1)).toBe(ADMIN)
  })

  it("labels every choice", () => {
    for (const choice of PLATFORM_ROLE_CHOICES) {
      expect(platformRoleChoiceLabel(choice)).not.toBe("Unknown")
    }
  })
})

describe("currentPlatformRole", () => {
  it("is none for an empty role list", () => {
    expect(currentPlatformRole([])).toBe(NO_PLATFORM_ROLE)
  })

  it("is the one assignable role held", () => {
    expect(currentPlatformRole([ADMIN])).toBe(ADMIN)
    expect(currentPlatformRole([HACKATHON_ORGANIZER])).toBe(HACKATHON_ORGANIZER)
  })

  // Both is representable through the API but is no single choice.
  it("is undefined for a user holding both", () => {
    expect(currentPlatformRole([ADMIN, HACKATHON_ORGANIZER])).toBeUndefined()
  })

  it("ignores a role this build cannot name", () => {
    expect(currentPlatformRole([99])).toBe(NO_PLATFORM_ROLE)
    expect(currentPlatformRole([99, ADMIN])).toBe(ADMIN)
  })
})

describe("planPlatformRoleChange", () => {
  it("grants from none", () => {
    expect(planPlatformRoleChange([], ADMIN)).toEqual({
      revoke: [],
      grant: ADMIN,
    })
  })

  it("revokes to none", () => {
    expect(planPlatformRoleChange([ADMIN], NO_PLATFORM_ROLE)).toEqual({
      revoke: [ADMIN],
      grant: undefined,
    })
  })

  it("switches by revoking the old role and granting the new", () => {
    expect(planPlatformRoleChange([HACKATHON_ORGANIZER], ADMIN)).toEqual({
      revoke: [HACKATHON_ORGANIZER],
      grant: ADMIN,
    })
  })

  it("does nothing when the target is already the only role", () => {
    expect(planPlatformRoleChange([ADMIN], ADMIN)).toEqual({
      revoke: [],
      grant: undefined,
    })
  })

  // Settling a user granted both out of band: keep the target, drop the other.
  it("drops the other role from a user holding both", () => {
    expect(
      planPlatformRoleChange([ADMIN, HACKATHON_ORGANIZER], HACKATHON_ORGANIZER),
    ).toEqual({ revoke: [ADMIN], grant: undefined })
  })

  it("leaves a role this build cannot name alone", () => {
    expect(planPlatformRoleChange([99, ADMIN], NO_PLATFORM_ROLE)).toEqual({
      revoke: [ADMIN],
      grant: undefined,
    })
  })
})
