import { describe, it, expect } from "vitest"
import { stateAlerts } from "./hackathonState"

// Capability numeric values.
const VOTE = 5
const VIEW_RESULTS = 6

describe("stateAlerts", () => {
  it("is silent when the configuration matches the current phase", () => {
    expect(
      stateAlerts({ hasState: true, currentPhaseName: "Hacking", unmet: [] }),
    ).toEqual([])
  })

  it("reports the current phase's plans that are switched off", () => {
    expect(
      stateAlerts({
        hasState: true,
        currentPhaseName: "Judging",
        unmet: [VOTE, VIEW_RESULTS],
      }),
    ).toEqual([
      {
        kind: "unmet",
        phaseName: "Judging",
        capabilities: [VOTE, VIEW_RESULTS],
      },
    ])
  })

  // Without the row nothing is enabled, so every planned capability is also
  // unmet — reporting both would bury the one fact that explains the other.
  it("reports only the missing state row, never the unmet list with it", () => {
    expect(
      stateAlerts({
        hasState: false,
        currentPhaseName: "Judging",
        unmet: [VOTE, VIEW_RESULTS],
      }),
    ).toEqual([{ kind: "no-state" }])
  })

  // The two conditions deliberately kept off the banner: untidy rather than
  // blocking, and the second is the steady state of every seeded hackathon.
  it("does not report a hackathon with no current phase", () => {
    expect(
      stateAlerts({ hasState: true, currentPhaseName: "", unmet: [] }),
    ).toEqual([])
  })

  // Defensive: `unmet` is computed against the current phase, so it should be
  // empty when there is none. If a caller ever passes both, the alert must not
  // render a sentence with an empty phase name in it.
  it("names the phase it was given", () => {
    const [alert] = stateAlerts({
      hasState: true,
      currentPhaseName: "Hacking",
      unmet: [VOTE],
    })
    expect(alert).toMatchObject({ kind: "unmet", phaseName: "Hacking" })
  })
})
