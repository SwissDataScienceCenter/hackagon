import { describe, expect, it } from "vitest"
import {
  ASSIGNABLE_GLOBAL_ROLES,
  GLOBAL_ROLE_FILTERS,
  displayableGlobalRoles,
  globalRoleBadgeVariant,
  globalRoleDescription,
  globalRoleFilterLabel,
  globalRoleLabel,
  matchesGlobalRoleFilter,
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

describe("globalRoleDescription", () => {
  // The users page offers every assignable role in a picker whose option text is
  // "<label> — <description>", and builds its legend from the same map. A role
  // without a description would show up as a dangling dash, so adding one to
  // ASSIGNABLE_GLOBAL_ROLES has to mean adding its description too.
  it("describes every assignable role", () => {
    for (const role of ASSIGNABLE_GLOBAL_ROLES) {
      expect(
        globalRoleDescription(role),
        `role ${role} has no description`,
      ).toBeTruthy()
    }
  })

  it("has nothing to say about a role this build cannot name", () => {
    expect(globalRoleDescription(99)).toBeUndefined()
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

  // Their row shows an "Unknown" badge rather than the grant picker, so they
  // are not what "No role" promises.
  it("keeps a user holding only an unnamed role out of no role", () => {
    expect(matchesGlobalRoleFilter([99], "none")).toBe(false)
  })
})
