/**
 * The organiser's mismatch warning.
 *
 * This is the third consumer of the capability vocabulary, and the one with no
 * coverage at all until now — it was reading its own private label map, which
 * is why it is in this batch.
 *
 * What it has to get right is a four-state question: a capability scheduled to
 * open in the phase the hackathon is IN, that is not open. COMING and CLOSED
 * both qualify and for different reasons (the schedule has not fired; someone
 * switched it off), while OPEN and UNGOVERNED both mean participants can act.
 * Reduce those four to a boolean and the alert either never fires or never
 * stops.
 */

import { describe, expect, it } from "vitest"
import { stateAlerts, type CapabilityRow } from "./hackathonState"
import { CapabilityState, capabilitySubject } from "./capability"

const VOTE = 5
const SUBMISSIONS = 4
const PHASE = "phase-judging"

function row(
  capability: number,
  state: number,
  openInPhaseId?: string,
): CapabilityRow {
  return { capability, state, openInPhaseId }
}

describe("stateAlerts", () => {
  it("warns when the current phase's capability has not opened yet", () => {
    const alerts = stateAlerts(
      [row(VOTE, CapabilityState.COMING, PHASE)],
      PHASE,
    )

    expect(alerts).toHaveLength(1)
    // Optional chaining, not a non-null assertion: an empty result then fails
    // the two assertions below rather than throwing past them.
    expect(alerts[0]?.capability).toBe(VOTE)
    expect(alerts[0]?.message).toContain(capabilitySubject(VOTE) as string)
  })

  it("warns when it was switched off instead", () => {
    // A different reason for the same wall a participant hits, so both states
    // have to reach the alert. Only checking one is how a four-state model
    // quietly becomes a two-state one.
    expect(
      stateAlerts([row(VOTE, CapabilityState.CLOSED, PHASE)], PHASE),
    ).toHaveLength(1)
  })

  it("stays quiet when the capability is open", () => {
    expect(
      stateAlerts([row(VOTE, CapabilityState.OPEN, PHASE)], PHASE),
    ).toEqual([])
  })

  it("stays quiet when nothing governs the capability", () => {
    // UNGOVERNED means the server permits it, so the timeline's promise is
    // being kept. Warning here would send an organiser to fix a working event.
    expect(
      stateAlerts([row(VOTE, CapabilityState.UNGOVERNED, PHASE)], PHASE),
    ).toEqual([])
  })

  it("ignores a capability scheduled for a different phase", () => {
    // Closed and scheduled for later is the normal state of most of them.
    expect(
      stateAlerts(
        [row(SUBMISSIONS, CapabilityState.CLOSED, "phase-hacking")],
        PHASE,
      ),
    ).toEqual([])
  })

  it("ignores a capability with no phase linked", () => {
    // Manually driven: it changes when someone changes it, so it can never
    // disagree with a phase.
    expect(
      stateAlerts([row(VOTE, CapabilityState.CLOSED, undefined)], PHASE),
    ).toEqual([])
  })

  it("says nothing at all when no phase is declared current", () => {
    // With nothing declared, nothing can be inconsistent with it.
    expect(
      stateAlerts([row(VOTE, CapabilityState.CLOSED, PHASE)], undefined),
    ).toEqual([])
  })

  it("names each capability that is behind, not just the first", () => {
    const alerts = stateAlerts(
      [
        row(SUBMISSIONS, CapabilityState.CLOSED, PHASE),
        row(VOTE, CapabilityState.COMING, PHASE),
      ],
      PHASE,
    )

    expect(alerts.map((a) => a.capability)).toEqual([SUBMISSIONS, VOTE])
    // And each names its own capability rather than repeating one sentence —
    // the alert is the only thing telling an organiser WHICH switch to go and
    // find.
    expect(new Set(alerts.map((a) => a.message)).size).toBe(2)
  })
})
