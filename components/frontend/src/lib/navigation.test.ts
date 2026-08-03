import { describe, it, expect } from "vitest"
import {
  activeNavId,
  defaultHackathon,
  hackathonRoleBadge,
  platformRoleBadge,
  type NavItem,
} from "./navigation"

// HackathonStatus numeric values.
const PENDING = 1
const ACTIVE = 2
const FINISHED = 3

// HackathonRole numeric values.
const ROLE_UNSPECIFIED = 0
const ROLE_OWNER = 1
const ROLE_MEMBER = 2

function h(id: string, status: number, startsAt?: string) {
  return { id, status, startsAt: startsAt ? new Date(startsAt) : undefined }
}

describe("defaultHackathon", () => {
  it("prefers one that is happening now", () => {
    const active = h("b", ACTIVE, "2026-07-01")
    const picked = defaultHackathon([
      h("a", PENDING, "2026-06-01"),
      active,
      h("c", FINISHED, "2026-08-01"),
    ])

    expect(picked).toBe(active)
  })

  it("falls back to the soonest upcoming one", () => {
    const soonest = h("b", PENDING, "2026-07-01")
    const picked = defaultHackathon([
      h("a", PENDING, "2026-09-01"),
      soonest,
      h("c", FINISHED, "2026-01-01"),
    ])

    expect(picked).toBe(soonest)
  })

  it("falls back to the most recently finished one", () => {
    // Finished hackathons read newest-first, the opposite of upcoming ones.
    const newest = h("b", FINISHED, "2026-06-01")
    const picked = defaultHackathon([
      h("a", FINISHED, "2025-01-01"),
      newest,
      h("c", FINISHED, "2026-02-01"),
    ])

    expect(picked).toBe(newest)
  })

  it("sorts undated hackathons after dated ones in the same group", () => {
    const dated = h("b", PENDING, "2026-09-01")
    const picked = defaultHackathon([h("a", PENDING), dated])

    expect(picked).toBe(dated)
  })

  it("still returns an undated hackathon when it is the only candidate", () => {
    const only = h("a", PENDING)

    expect(defaultHackathon([only])).toBe(only)
  })

  it("ranks an unrecognized status last", () => {
    const real = h("b", FINISHED, "2020-01-01")
    const picked = defaultHackathon([h("a", 0, "2026-09-01"), real])

    expect(picked).toBe(real)
  })

  it("breaks ties by id so the order cannot drift between renders", () => {
    const first = defaultHackathon([
      h("b", ACTIVE, "2026-07-01"),
      h("a", ACTIVE, "2026-07-01"),
    ])
    const second = defaultHackathon([
      h("a", ACTIVE, "2026-07-01"),
      h("b", ACTIVE, "2026-07-01"),
    ])

    expect(first?.id).toBe("a")
    expect(second?.id).toBe("a")
  })

  it("returns undefined when there is nothing to pick", () => {
    expect(defaultHackathon([])).toBeUndefined()
  })
})

describe("activeNavId", () => {
  // The icon is irrelevant to matching, and constructing a real Svelte
  // component here would pull the whole lucide barrel into a unit test.
  const item = (id: string, href?: string) =>
    ({
      id,
      label: id,
      icon: null as unknown as NavItem["icon"],
      href,
    }) as NavItem

  const items = [
    item("overview", "/my/hackathon/abc/overview"),
    item("teams", "/my/hackathon/abc/teams"),
    item("dashboard", "/dashboard"),
  ]

  it("matches an exact pathname", () => {
    expect(activeNavId("/my/hackathon/abc/teams", items)).toBe("teams")
  })

  it("matches a nested route to its parent entry", () => {
    expect(activeNavId("/my/hackathon/abc/teams/xyz", items)).toBe("teams")
  })

  it("does not treat a shared prefix as a match", () => {
    // /teams-archive must not light up /teams.
    expect(
      activeNavId("/my/hackathon/abc/teams-archive", items),
    ).toBeUndefined()
  })

  it("lets the longest match win", () => {
    const nested = [
      item("teams", "/my/hackathon/abc/teams"),
      item("team-detail", "/my/hackathon/abc/teams/xyz"),
    ]

    expect(activeNavId("/my/hackathon/abc/teams/xyz", nested)).toBe(
      "team-detail",
    )
  })

  it("ignores stub entries that have no href", () => {
    expect(activeNavId("/dashboard", [item("stub")])).toBeUndefined()
  })

  it("returns undefined when nothing matches", () => {
    expect(activeNavId("/signout", items)).toBeUndefined()
  })
})

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

describe("platformRoleBadge", () => {
  it("labels an admin", () => {
    expect(
      platformRoleBadge({ isGlobalAdmin: true, isHackathonOrganizer: false }),
    ).toBe("Admin")
  })

  it("labels an organiser", () => {
    expect(
      platformRoleBadge({ isGlobalAdmin: false, isHackathonOrganizer: true }),
    ).toBe("Organiser")
  })

  it("prefers Admin when both roles are held", () => {
    expect(
      platformRoleBadge({ isGlobalAdmin: true, isHackathonOrganizer: true }),
    ).toBe("Admin")
  })

  it("has no badge for a plain user", () => {
    expect(
      platformRoleBadge({ isGlobalAdmin: false, isHackathonOrganizer: false }),
    ).toBeUndefined()
  })
})
