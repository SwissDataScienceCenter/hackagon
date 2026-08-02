import { describe, it, expect } from "vitest"
import {
  CAPABILITIES,
  isAvailable,
  isBlocked,
  resolveCapabilities,
  type Capability,
  type CapabilityState,
} from "./capabilities"

function settings(registrationsEnabled: boolean, votingEnabled = false) {
  return { settings: { registrationsEnabled, votingEnabled } }
}

describe("resolveCapabilities", () => {
  it("opens register when the toggle is on", () => {
    expect(resolveCapabilities(settings(true)).register).toBe("open")
  })

  it("closes register when the toggle is off", () => {
    expect(resolveCapabilities(settings(false)).register).toBe("closed")
  })

  it("resolves vote from its own toggle, independently of register", () => {
    const states = resolveCapabilities(settings(false, true))

    expect(states.vote).toBe("open")
    expect(states.register).toBe("closed")
  })

  it.each([undefined, null])(
    "closes the governed capabilities when settings are %s",
    (missing) => {
      // Hackathons predating the settings table have no row, and the backend
      // rejects the mutation outright — so `closed` is the truthful answer.
      const states = resolveCapabilities({ settings: missing })

      expect(states.register).toBe("closed")
      expect(states.vote).toBe("closed")
    },
  )

  it("leaves capabilities with no backend gate ungoverned", () => {
    const states = resolveCapabilities(settings(true))

    expect(states.submit_proposal).toBe("ungoverned")
    expect(states.set_team_preferences).toBe("ungoverned")
    expect(states.submit_project).toBe("ungoverned")
    expect(states.view_results).toBe("ungoverned")
  })

  it("keeps ungoverned capabilities available regardless of the toggles", () => {
    // The regression this guards: gating the Propose CTA on a resolver that
    // called every ungated capability `closed` would hide the button forever.
    for (const input of [settings(false), settings(true), { settings: null }]) {
      expect(isAvailable(resolveCapabilities(input).submit_proposal)).toBe(true)
    }
  })

  it("answers for every capability in the vocabulary", () => {
    const states = resolveCapabilities(settings(true))

    for (const capability of CAPABILITIES) {
      expect(states[capability]).toBeDefined()
    }
    expect(Object.keys(states).sort()).toEqual([...CAPABILITIES].sort())
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

  it("never reports a state as both available and blocked", () => {
    for (const [state] of cases) {
      expect(isAvailable(state) && isBlocked(state)).toBe(false)
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
