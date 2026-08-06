import { describe, it, expect } from "vitest"
import { activeNavId } from "./active"
import { type NavItem } from "./items"

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
