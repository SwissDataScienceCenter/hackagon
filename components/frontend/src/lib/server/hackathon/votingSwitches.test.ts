import { describe, it, expect } from "vitest"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { mayPublishResults, switchNote } from "./votingSwitches"

const VOTE = Capability.CAPABILITY_VOTE as number
const VIEW_RESULTS = Capability.CAPABILITY_VIEW_RESULTS as number
const SUBMIT = Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS as number

const notFinal = { final: false, anyVotes: true }
const final = { final: true, anyVotes: true }
const nobodyVoted = { final: false, anyVotes: false }

describe("mayPublishResults", () => {
  it("refuses only while people have voted and results are not final", () => {
    expect(mayPublishResults(notFinal)).toBe(false)
    expect(mayPublishResults(final)).toBe(true)
  })

  // The two ways the one lock in Settings can never get stuck.
  it("allows it when nobody has voted, or when the state could not be read", () => {
    expect(mayPublishResults(nobodyVoted)).toBe(true)
    expect(mayPublishResults(undefined)).toBe(true)
  })
})

describe("switchNote", () => {
  it("locks View results while it is off and the results are not final", () => {
    expect(switchNote(VIEW_RESULTS, [], notFinal).lockedReason).toBeDefined()
  })

  // Settings is never blocked: switching off must always be possible.
  it("never locks View results while it is on", () => {
    expect(
      switchNote(VIEW_RESULTS, [VIEW_RESULTS], notFinal).lockedReason,
    ).toBeUndefined()
  })

  it("warns instead of locking when the state could not be read", () => {
    const note = switchNote(VIEW_RESULTS, [], undefined)
    expect(note.lockedReason).toBeUndefined()
    expect(note.warnings).toHaveLength(1)
  })

  it("only warns about Vote once results are final — never locks it", () => {
    const note = switchNote(VOTE, [], final)
    expect(note.lockedReason).toBeUndefined()
    expect(note.warnings).toHaveLength(1)
  })

  it("warns on both Vote and Submit while both are on", () => {
    expect(switchNote(VOTE, [VOTE, SUBMIT], notFinal).warnings).toHaveLength(1)
    expect(switchNote(SUBMIT, [VOTE, SUBMIT], notFinal).warnings).toHaveLength(
      1,
    )
    expect(switchNote(SUBMIT, [SUBMIT], notFinal).warnings).toHaveLength(0)
  })

  it("never locks anything but View results", () => {
    for (const c of [VOTE, SUBMIT]) {
      expect(switchNote(c, [], notFinal).lockedReason).toBeUndefined()
    }
  })
})
