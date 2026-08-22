import { describe, it, expect } from "vitest"
import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"
import { mayProposeProjects, mayPreferProjects, mayVote } from "./capabilities"

// HackathonRole numeric values: UNSPECIFIED=0, OWNER=1, MEMBER=2.
const OWNER = 1
const MEMBER = 2

const member = (role: number, isWaiting = false) =>
  ({ role, isWaiting }) as HackathonMember

const ON = true
const OFF = false

describe("mayProposeProjects", () => {
  // The rule the backend actually applies, and the one this gate got wrong: the
  // capability writes the `member` row only, so an owner's own grant is a
  // default policy the switch never touches.
  it("offers it to an owner whether the capability is on or off", () => {
    expect(mayProposeProjects(member(OWNER), ON)).toBe(true)
    expect(mayProposeProjects(member(OWNER), OFF)).toBe(true)
  })

  // Why that matters: this CTA is the only create path in the app. An organiser
  // refused here in a hackathon that runs without proposals could not add a
  // project at all.
  it("offers it to an admin with no membership at all", () => {
    expect(mayProposeProjects(undefined, OFF, true)).toBe(true)
  })

  it("offers it to a member only while the capability is on", () => {
    expect(mayProposeProjects(member(MEMBER), ON)).toBe(true)
    expect(mayProposeProjects(member(MEMBER), OFF)).toBe(false)
  })

  it("refuses a waitlisted member even with the capability on", () => {
    expect(mayProposeProjects(member(MEMBER, true), ON)).toBe(false)
  })

  it("refuses someone who is not in the hackathon", () => {
    expect(mayProposeProjects(undefined, ON)).toBe(false)
  })
})

// Two neighbours of the same shape, so the difference between "gated on a
// capability" and "not" is asserted rather than left to the doc comments.
describe("the capability-gated gates beside it", () => {
  it("gates voting on its capability, for a member and an owner alike", () => {
    expect(mayVote(member(MEMBER), ON)).toBe(true)
    expect(mayVote(member(MEMBER), OFF)).toBe(false)
    expect(mayVote(member(OWNER), OFF)).toBe(false)
  })

  it("offers preferences to anyone confirmed, gated on no capability", () => {
    expect(mayPreferProjects(member(MEMBER))).toBe(true)
    expect(mayPreferProjects(member(OWNER))).toBe(true)
    expect(mayPreferProjects(member(MEMBER, true))).toBe(false)
    expect(mayPreferProjects(undefined)).toBe(false)
  })
})
