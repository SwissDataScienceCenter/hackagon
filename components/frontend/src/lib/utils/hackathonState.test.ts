import { describe, it, expect } from "vitest"
import { stateAlerts } from "./hackathonState"

describe("stateAlerts", () => {
  // The one condition that reaches the banner: no `HackathonState` row at all,
  // which no switch can express and which leaves participants unable to do
  // anything.
  it("reports a hackathon with no configuration record", () => {
    expect(stateAlerts({ hasState: false })).toEqual([{ kind: "no-state" }])
  })

  it("is silent for a hackathon that has one", () => {
    expect(stateAlerts({ hasState: true })).toEqual([])
  })

  // Asserted rather than left to the doc comment, because this used to be an
  // alert and reviving it would put a banner over every page of a hackathon
  // whose organizer deliberately switched a capability off. The mismatch belongs
  // to `CapabilitiesPanel`, beside the switch that changes it.
  it("says nothing about a phase whose planned capabilities are off", () => {
    expect(stateAlerts({ hasState: true })).toEqual([])
  })
})
