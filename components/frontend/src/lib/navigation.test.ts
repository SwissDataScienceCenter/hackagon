import { describe, it, expect } from "vitest"
import { defaultHackathon, memberNav } from "./navigation"
import { readCapabilities } from "./utils/capabilities"

// HackathonStatus numeric values.
const PENDING = 1
const ACTIVE = 2
const FINISHED = 3

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

  it("does not reorder the caller's array", () => {
    const list = [h("a", FINISHED, "2020-01-01"), h("b", ACTIVE, "2026-07-01")]
    defaultHackathon(list)

    expect(list.map((x) => x.id)).toEqual(["a", "b"])
  })

  it("returns undefined for an empty list", () => {
    expect(defaultHackathon([])).toBeUndefined()
  })
})

describe("memberNav gates", () => {
  const gateOf = (items: ReturnType<typeof memberNav>, id: string) =>
    items.find((i) => i.id === id)?.gate

  // Wire values: capability 4 = submit_project, state 3 = closed.
  const closedSubmissions = readCapabilities([{ capability: 4, state: 3 }])

  it("attaches nothing when no capability data is passed", () => {
    const items = memberNav("h1", [])

    expect(items.every((i) => i.gate === undefined)).toBe(true)
  })

  it("gates the entries a capability actually governs", () => {
    const items = memberNav("h1", [], closedSubmissions)

    expect(gateOf(items, "member:submissions")).toEqual({
      capability: "submit_project",
      state: "closed",
      opensAt: undefined,
      closesAt: undefined,
      opensPhaseId: undefined,
      closesPhaseId: undefined,
    })
  })

  it("leaves always-readable entries ungated", () => {
    const items = memberNav(
      "h1",
      [{ id: "p1", title: "Rules" }],
      closedSubmissions,
    )

    expect(gateOf(items, "member:overview")).toBeUndefined()
    expect(gateOf(items, "member:timeline")).toBeUndefined()
    expect(gateOf(items, "member:page:p1")).toBeUndefined()
  })

  // A member in the shell has already joined, so `register` describes other
  // people. Asserted so re-adding it is a deliberate act, not a drive-by.
  it("does not gate Participants on registration", () => {
    const items = memberNav("h1", [], closedSubmissions)

    expect(gateOf(items, "member:participants")).toBeUndefined()
  })

  it("reports an unmentioned capability as ungoverned, not closed", () => {
    const items = memberNav("h1", [], closedSubmissions)

    expect(gateOf(items, "member:teams")?.state).toBe("ungoverned")
  })
})
