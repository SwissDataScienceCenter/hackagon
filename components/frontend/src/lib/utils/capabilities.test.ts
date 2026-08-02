import { describe, it, expect } from "vitest"
import {
  CAPABILITIES,
  capabilitiesByPhase,
  capabilityNoun,
  deadlineLabel,
  isAvailable,
  isBlocked,
  lockReason,
  nextDeadline,
  primaryAction,
  readCapabilities,
  type Capability,
  type CapabilityState,
} from "./capabilities"

// Wire values, mirroring hackathon.entities.Capability / CapabilityState.
const REGISTER = 1
const SUBMIT_PROPOSAL = 2
const SUBMIT_PROJECT = 4
const VOTE = 5
const VIEW_RESULTS = 6
const COMING = 1
const OPEN = 2
const CLOSED = 3
const UNGOVERNED = 4

const NOW = new Date("2026-07-15T12:00:00Z")

function at(days: number): Date {
  const d = new Date(NOW)
  d.setUTCDate(d.getUTCDate() + days)

  return d
}

describe("readCapabilities", () => {
  it("translates the wire enums", () => {
    const caps = readCapabilities([
      { capability: REGISTER, state: OPEN },
      { capability: SUBMIT_PROPOSAL, state: CLOSED },
      { capability: VOTE, state: COMING },
    ])

    expect(caps.register.state).toBe("open")
    expect(caps.submit_proposal.state).toBe("closed")
    expect(caps.vote.state).toBe("coming")
  })

  it("carries the schedule through", () => {
    const opensAt = at(3)
    const closesAt = at(10)
    const caps = readCapabilities([
      { capability: REGISTER, state: OPEN, opensAt, closesAt },
    ])

    expect(caps.register.opensAt).toBe(opensAt)
    expect(caps.register.closesAt).toBe(closesAt)
  })

  it("fills capabilities the server did not mention as ungoverned", () => {
    const caps = readCapabilities([{ capability: REGISTER, state: OPEN }])

    expect(caps.submit_proposal.state).toBe("ungoverned")
    expect(caps.view_results.state).toBe("ungoverned")
  })

  it.each([undefined, []])(
    "reports everything ungoverned for %s input",
    (input) => {
      // An older backend, or a hackathon predating capabilities, must not have
      // every action vanish.
      const caps = readCapabilities(input)

      for (const c of CAPABILITIES) {
        expect(caps[c].state).toBe("ungoverned")
      }
    },
  )

  it("answers for every capability in the vocabulary", () => {
    const caps = readCapabilities([{ capability: REGISTER, state: OPEN }])

    expect(Object.keys(caps).sort()).toEqual([...CAPABILITIES].sort())
  })

  it("ignores capabilities it does not recognize", () => {
    const caps = readCapabilities([
      { capability: REGISTER, state: OPEN },
      { capability: 99, state: OPEN },
      { capability: -1, state: OPEN },
    ])

    expect(Object.keys(caps).sort()).toEqual([...CAPABILITIES].sort())
    expect(caps.register.state).toBe("open")
  })

  it("treats an unrecognized state as ungoverned", () => {
    const caps = readCapabilities([{ capability: REGISTER, state: 0 }])

    expect(caps.register.state).toBe("ungoverned")
  })

  it("passes an explicit ungoverned state through", () => {
    const caps = readCapabilities([{ capability: REGISTER, state: UNGOVERNED }])

    expect(caps.register.state).toBe("ungoverned")
  })
})

describe("isAvailable / isBlocked", () => {
  const cases: [CapabilityState, boolean, boolean][] = [
    // state, available, blocked
    ["open", true, false],
    ["ungoverned", true, false],
    ["closed", false, true],
    ["coming", false, true],
  ]

  it.each(cases)("%s → available %s, blocked %s", (state, available, blocked) => {
    expect(isAvailable(state)).toBe(available)
    expect(isBlocked(state)).toBe(blocked)
  })

  it("keeps an ungoverned capability usable", () => {
    // The regression this guards: gating a CTA on `state === "open"` would hide
    // it on every hackathon the server has no row for.
    const caps = readCapabilities([])

    expect(isAvailable(caps.submit_proposal.state)).toBe(true)
  })

  it("never reports a state as both available and blocked", () => {
    for (const [state] of cases) {
      expect(isAvailable(state) && isBlocked(state)).toBe(false)
    }
  })
})

describe("lockReason", () => {
  it("names the opening date for a coming capability", () => {
    const reason = lockReason("submit_proposal", {
      state: "coming",
      opensAt: new Date("2026-08-21T09:00:00Z"),
    })

    expect(reason).toBe("Proposals open Aug 21")
  })

  it("avoids promising a date when a coming capability has none", () => {
    expect(lockReason("vote", { state: "coming" })).toBe("Voting not open yet")
  })

  it("says closed without a date", () => {
    expect(lockReason("submit_proposal", { state: "closed" })).toBe(
      "Proposals closed",
    )
  })

  it("returns nothing for an available capability", () => {
    // So a caller cannot render a lock reason beside a working button.
    expect(lockReason("submit_proposal", { state: "open" })).toBeUndefined()
    expect(lockReason("submit_proposal", { state: "ungoverned" })).toBeUndefined()
  })
})

describe("nextDeadline", () => {
  it("returns the soonest closing of an open capability", () => {
    const caps = readCapabilities([
      { capability: SUBMIT_PROPOSAL, state: OPEN, closesAt: at(2) },
      { capability: REGISTER, state: OPEN, closesAt: at(9) },
    ])

    expect(nextDeadline(caps, NOW)).toEqual({
      capability: "submit_proposal",
      label: "Proposals due",
      at: at(2),
    })
  })

  it("considers a coming capability opening", () => {
    const caps = readCapabilities([
      { capability: REGISTER, state: OPEN, closesAt: at(9) },
      { capability: SUBMIT_PROPOSAL, state: COMING, opensAt: at(1) },
    ])

    expect(nextDeadline(caps, NOW)?.label).toBe("Proposals open")
  })

  it("skips dates already in the past", () => {
    // The server's state is the truth; a stale schedule must not produce a
    // countdown that already elapsed.
    const caps = readCapabilities([
      { capability: SUBMIT_PROPOSAL, state: OPEN, closesAt: at(-1) },
      { capability: REGISTER, state: OPEN, closesAt: at(4) },
    ])

    expect(nextDeadline(caps, NOW)?.capability).toBe("register")
  })

  it("ignores the schedule of a closed capability", () => {
    const caps = readCapabilities([
      { capability: SUBMIT_PROPOSAL, state: CLOSED, closesAt: at(2) },
    ])

    expect(nextDeadline(caps, NOW)).toBeUndefined()
  })

  it("ignores an open capability with no closing date", () => {
    const caps = readCapabilities([{ capability: REGISTER, state: OPEN }])

    expect(nextDeadline(caps, NOW)).toBeUndefined()
  })

  it("returns nothing when there are no capabilities at all", () => {
    expect(nextDeadline(readCapabilities([]), NOW)).toBeUndefined()
  })
})

describe("deadlineLabel", () => {
  it("shows the date for a deadline on another day", () => {
    const caps = readCapabilities([
      { capability: SUBMIT_PROPOSAL, state: OPEN, closesAt: at(3) },
    ])
    const deadline = nextDeadline(caps, NOW)!

    expect(deadlineLabel(deadline, NOW)).toBe("Proposals due Jul 18")
  })

  it("shows a time instead when the deadline is today", () => {
    // "due Jul 15" on Jul 15 tells a member nothing, and same-day is when the
    // deadline matters most.
    const closesAt = new Date("2026-07-15T17:00:00Z")
    const caps = readCapabilities([
      { capability: SUBMIT_PROJECT, state: OPEN, closesAt },
    ])
    const deadline = nextDeadline(caps, NOW)!

    expect(deadlineLabel(deadline, NOW)).toMatch(/^Submissions due \d{1,2}:\d{2}/)
  })
})

describe("primaryAction", () => {
  it("picks the most urgent open capability", () => {
    const caps = readCapabilities([
      { capability: SUBMIT_PROPOSAL, state: OPEN },
      { capability: SUBMIT_PROJECT, state: OPEN },
    ])

    expect(primaryAction(caps)).toEqual({
      capability: "submit_project",
      label: "Submit your project",
      target: "submissions",
    })
  })

  it("falls through to a lower priority when the top one is closed", () => {
    const caps = readCapabilities([
      { capability: SUBMIT_PROJECT, state: CLOSED },
      { capability: SUBMIT_PROPOSAL, state: OPEN },
    ])

    expect(primaryAction(caps).capability).toBe("submit_proposal")
  })

  it("falls back to the timeline when nothing is open", () => {
    const caps = readCapabilities([
      { capability: SUBMIT_PROJECT, state: CLOSED },
      { capability: SUBMIT_PROPOSAL, state: COMING },
    ])

    expect(primaryAction(caps)).toEqual({
      label: "View timeline",
      target: "timeline",
    })
  })

  it("does not advertise an ungoverned capability", () => {
    // Deliberately unlike isAvailable: not knowing whether something is open is
    // a reason to leave a button working, not to headline it.
    const caps = readCapabilities([])

    expect(primaryAction(caps).target).toBe("timeline")
    expect(primaryAction(caps).capability).toBeUndefined()
  })

  it("never headlines a capability with nowhere to go", () => {
    // vote and view_results rank highly in principle but have no UI yet.
    const caps = readCapabilities([
      { capability: VOTE, state: OPEN },
      { capability: VIEW_RESULTS, state: OPEN },
    ])

    expect(primaryAction(caps).target).toBe("timeline")
  })
})

describe("capabilitiesByPhase", () => {
  it("groups capabilities under the phase that opens or closes them", () => {
    const caps = readCapabilities([
      {
        capability: SUBMIT_PROPOSAL,
        state: COMING,
        opensPhaseId: "ideation",
        closesPhaseId: "hacking",
      },
      { capability: SUBMIT_PROJECT, state: COMING, opensPhaseId: "hacking" },
    ])

    const byPhase = capabilitiesByPhase(caps)

    expect(byPhase.get("ideation")).toEqual({
      opens: ["submit_proposal"],
      closes: [],
    })
    expect(byPhase.get("hacking")).toEqual({
      opens: ["submit_project"],
      closes: ["submit_proposal"],
    })
  })

  it("collects several capabilities sharing one phase", () => {
    const caps = readCapabilities([
      { capability: SUBMIT_PROPOSAL, state: COMING, opensPhaseId: "ideation" },
      { capability: 3, state: COMING, opensPhaseId: "ideation" },
    ])

    expect(capabilitiesByPhase(caps).get("ideation")?.opens).toEqual([
      "submit_proposal",
      "set_team_preferences",
    ])
  })

  it("omits manually driven capabilities entirely", () => {
    // Voting links to no phase by design, so no phase should claim it.
    const caps = readCapabilities([
      { capability: VOTE, state: CLOSED },
      { capability: SUBMIT_PROPOSAL, state: COMING, opensPhaseId: "ideation" },
    ])

    const byPhase = capabilitiesByPhase(caps)

    expect(byPhase.size).toBe(1)
    expect([...byPhase.values()].flatMap((p) => [...p.opens, ...p.closes])).not.toContain(
      "vote",
    )
  })

  it("is empty when nothing is scheduled", () => {
    expect(capabilitiesByPhase(readCapabilities([])).size).toBe(0)
  })
})

describe("capabilityNoun", () => {
  it("gives a short member-facing name", () => {
    expect(capabilityNoun("submit_proposal")).toBe("Proposals")
    expect(capabilityNoun("register")).toBe("Registration")
  })

  it("names every capability in the vocabulary", () => {
    for (const c of CAPABILITIES) {
      expect(capabilityNoun(c)).toBeTruthy()
    }
  })
})

describe("capability vocabulary", () => {
  it("has no duplicates", () => {
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length)
  })

  it("matches the Capability union exactly", () => {
    // Fails to compile if a union member is missing from CAPABILITIES.
    const exhaustive: Record<Capability, true> = {
      register: true,
      submit_proposal: true,
      set_team_preferences: true,
      submit_project: true,
      vote: true,
      view_results: true,
    }

    expect(Object.keys(exhaustive).sort()).toEqual([...CAPABILITIES].sort())
  })
})
