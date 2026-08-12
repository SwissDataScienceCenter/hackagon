/**
 * The one capability table, and the four states it has to keep apart.
 *
 * Two claims are load-bearing here and neither is obvious from reading the
 * file:
 *
 * 1. **Every capability carries every string.** This is the test main's
 *    `refactor(frontend): hold each capability's label and sentence in one
 *    table` said had to exist, because parallel maps keyed by the same enum
 *    numbers can disagree — a capability with a label and no sentence renders a
 *    switch that explains nothing. On this branch there were three such maps.
 *
 * 2. **The four states are four.** `origin/main` replaced our `Capability`
 *    entity with flat booleans; this branch keeps COMING / OPEN / CLOSED /
 *    UNGOVERNED and projects `HackathonState` over them without enforcement. A
 *    test that only ever exercised OPEN and CLOSED would pass just as happily
 *    against a two-state flattening, so the states are asserted PAIRWISE
 *    DISTINCT rather than one at a time.
 */

import { describe, expect, it } from "vitest"
import {
  CAPABILITY_VALUES,
  CapabilityState,
  capabilityAction,
  capabilityAllows,
  capabilityDescription,
  capabilityEntry,
  capabilityHref,
  capabilityIsComing,
  capabilityIsOn,
  capabilityIsUngoverned,
  capabilityLabel,
  capabilityStateLabel,
  capabilityStateNote,
  capabilitySubject,
  isKnownCapability,
  knownCapabilityRows,
} from "./capability"
import { PHASE_CAPABILITIES, capabilityLabel as phaseLabel } from "./phase"

const REGISTER = 1
const PROPOSE = 2
const PREFERENCES = 3
const SUBMISSIONS = 4
const VOTE = 5
const VIEW_RESULTS = 6

describe("the capability table", () => {
  it("holds the six proto values in enum order", () => {
    expect(CAPABILITY_VALUES).toEqual([1, 2, 3, 4, 5, 6])
  })

  // The pairing test. One capability short of one string is the failure the
  // table exists to make impossible.
  it("gives every capability all four forms of words, none empty", () => {
    for (const value of CAPABILITY_VALUES) {
      const entry = capabilityEntry(value)
      expect(entry, `capability ${value} has no row`).toBeDefined()
      expect(capabilityLabel(value)?.length, `label ${value}`).toBeGreaterThan(
        0,
      )
      expect(
        capabilityDescription(value)?.length,
        `description ${value}`,
      ).toBeGreaterThan(0)
      expect(
        capabilityAction(value)?.length,
        `action ${value}`,
      ).toBeGreaterThan(0)
      expect(
        capabilitySubject(value)?.length,
        `subject ${value}`,
      ).toBeGreaterThan(0)
    }
  })

  it("keeps the labels distinct, so no two switches read the same", () => {
    const labels = CAPABILITY_VALUES.map((v) => capabilityLabel(v))
    expect(new Set(labels).size).toBe(CAPABILITY_VALUES.length)
  })

  it("describes what a participant may do, in the third person", () => {
    // Capabilities grant to the Member role and casbin has no inheritance, so
    // an owner reading "you can" is being told something false about themselves.
    for (const value of CAPABILITY_VALUES) {
      expect(capabilityDescription(value)?.toLowerCase()).not.toContain("you ")
    }
  })

  it("says that switching results on is what publishes them", () => {
    // Not main's wording. Here the flag doubles as the publish switch, because
    // results are entered one placement at a time and must not leak partial
    // standings — so "results that have been published" describes a different
    // mechanism from the one this branch has.
    expect(capabilityDescription(VIEW_RESULTS)).toContain("publishes them")
  })

  it("answers undefined for a value the enum does not have", () => {
    for (const unknown of [0, 7, 99, -1]) {
      expect(capabilityEntry(unknown)).toBeUndefined()
      expect(capabilityLabel(unknown)).toBeUndefined()
      expect(capabilityDescription(unknown)).toBeUndefined()
      expect(capabilityAction(unknown)).toBeUndefined()
      expect(capabilitySubject(unknown)).toBeUndefined()
      expect(isKnownCapability(unknown)).toBe(false)
    }
  })
})

describe("capabilityHref", () => {
  it("sends each capability to the page that exercises it", () => {
    expect(capabilityHref("h1", PROPOSE)).toBe(
      "/my/hackathon/h1/projects/proposals/propose",
    )
    expect(capabilityHref("h1", PREFERENCES)).toBe("/my/hackathon/h1/projects")
    expect(capabilityHref("h1", SUBMISSIONS)).toBe(
      "/my/hackathon/h1/submissions",
    )
    // Ours folds results into the voting page; main has a separate /results.
    expect(capabilityHref("h1", VOTE)).toBe("/my/hackathon/h1/voting")
    expect(capabilityHref("h1", VIEW_RESULTS)).toBe("/my/hackathon/h1/voting")
  })

  it("has no page for registering, which is behind whoever is reading", () => {
    expect(capabilityHref("h1", REGISTER)).toBeUndefined()
  })

  it("has no page for a capability it does not know", () => {
    expect(capabilityHref("h1", 99)).toBeUndefined()
  })
})

describe("knownCapabilityRows", () => {
  it("puts rows in the table's order however they arrive", () => {
    const rows = [
      { capability: VOTE },
      { capability: REGISTER },
      { capability: SUBMISSIONS },
    ]
    expect(knownCapabilityRows(rows).map((r) => r.capability)).toEqual([
      REGISTER,
      SUBMISSIONS,
      VOTE,
    ])
  })

  it("drops a capability this build cannot name", () => {
    // A frontend against a newer backend can receive a seventh. An unnamed
    // switch is one nobody can tell what they are turning on.
    const rows = [{ capability: 99 }, { capability: VOTE }]
    expect(knownCapabilityRows(rows).map((r) => r.capability)).toEqual([VOTE])
  })

  it("keeps the rest of each row intact", () => {
    const rows = [{ capability: VOTE, state: 2, opensAt: undefined }]
    expect(knownCapabilityRows(rows)[0]).toEqual(rows[0])
  })
})

describe("the four capability states", () => {
  const all = [
    CapabilityState.COMING,
    CapabilityState.OPEN,
    CapabilityState.CLOSED,
    CapabilityState.UNGOVERNED,
  ]

  it("numbers them as the proto does", () => {
    expect(all).toEqual([1, 2, 3, 4])
  })

  // THE anti-flattening assertion. Four states that render as two words is the
  // regression this branch is most exposed to, and it would look like a tidy
  // refactor in a diff.
  it("gives each state a label no other state shares", () => {
    const labels = all.map((s) => capabilityStateLabel(s))
    expect(labels.every((l) => (l?.length ?? 0) > 0)).toBe(true)
    expect(new Set(labels).size).toBe(4)
  })

  it("gives each state an explanation no other state shares", () => {
    const notes = all.map((s) => capabilityStateNote(s))
    expect(notes.every((n) => (n?.length ?? 0) > 0)).toBe(true)
    expect(new Set(notes).size).toBe(4)
  })

  it("counts UNGOVERNED as permitted, matching the server's Allowed", () => {
    // `capability.State.Allowed` returns true for ungoverned: no row governs
    // it, so the mutation proceeds. A client comparing against OPEN alone would
    // tell people they cannot do something the server will happily let them do.
    expect(capabilityAllows(CapabilityState.OPEN)).toBe(true)
    expect(capabilityAllows(CapabilityState.UNGOVERNED)).toBe(true)
    expect(capabilityAllows(CapabilityState.COMING)).toBe(false)
    expect(capabilityAllows(CapabilityState.CLOSED)).toBe(false)
  })

  it("separates the stored flag from what is permitted", () => {
    // The distinction IS ungoverned: a checkbox bound to `enabled` reflects the
    // first, a participant lives under the second.
    expect(capabilityIsOn(CapabilityState.OPEN)).toBe(true)
    expect(capabilityIsOn(CapabilityState.UNGOVERNED)).toBe(false)
    expect(capabilityAllows(CapabilityState.UNGOVERNED)).toBe(true)
  })

  it("tells COMING and UNGOVERNED apart from CLOSED", () => {
    expect(capabilityIsComing(CapabilityState.COMING)).toBe(true)
    expect(capabilityIsComing(CapabilityState.CLOSED)).toBe(false)
    expect(capabilityIsUngoverned(CapabilityState.UNGOVERNED)).toBe(true)
    expect(capabilityIsUngoverned(CapabilityState.CLOSED)).toBe(false)
  })

  it("counts down to a scheduled opening when the row carries a date", () => {
    const opensAt = new Date(2026, 7, 12, 9, 0)
    const withDate = capabilityStateLabel(CapabilityState.COMING, opensAt)
    // Not re-implementing the formatter — asserting it produced a day and a
    // month, and that this differs from the dateless answer.
    expect(withDate).toMatch(/^Opens \d{1,2} \w{3}$/)
    expect(withDate).not.toBe(capabilityStateLabel(CapabilityState.COMING))
  })

  it("says only what it knows when the opening has no date", () => {
    // Reachable: an organiser who advanced by hand past a phase with no dates.
    expect(capabilityStateLabel(CapabilityState.COMING)).toBe("Opens later")
  })

  it("ignores a date on any state but COMING", () => {
    const opensAt = new Date(2026, 7, 12)
    expect(capabilityStateLabel(CapabilityState.OPEN, opensAt)).toBe("Open")
  })

  it("answers undefined for a state it cannot name", () => {
    for (const unknown of [0, 5, 99]) {
      expect(capabilityStateLabel(unknown)).toBeUndefined()
      expect(capabilityStateNote(unknown)).toBeUndefined()
    }
  })
})

describe("the phase module's re-exports", () => {
  // `$lib/utils/phase` used to keep its own copy of these strings, and a second
  // copy is how a capability ends up called one thing beside its switch and
  // another in the sentence explaining it.
  it("labels capabilities with the same words the table holds", () => {
    for (const value of CAPABILITY_VALUES) {
      expect(phaseLabel(value)).toBe(capabilityLabel(value))
    }
  })

  it("lists the six with the labels that belong to them", () => {
    expect(PHASE_CAPABILITIES.map((c) => c.value)).toEqual(CAPABILITY_VALUES)
    for (const entry of PHASE_CAPABILITIES) {
      expect(entry.label).toBe(capabilityLabel(entry.value))
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })
})
