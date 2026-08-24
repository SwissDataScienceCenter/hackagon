import { describe, it, expect } from "vitest"
import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"
import {
  mayProposeProjects,
  mayPreferProjects,
  mayReviewProjects,
  mayVote,
} from "./capabilities"

// HackathonRole numeric values: UNSPECIFIED=0, OWNER=1, MEMBER=2.
const OWNER = 1
const MEMBER = 2

const member = (role: number, isWaiting = false) =>
  ({ role, isWaiting }) as HackathonMember

const ON = true
const OFF = false

describe("mayProposeProjects", () => {
  it("offers it to a member only while the capability is on", () => {
    expect(mayProposeProjects(member(MEMBER), ON)).toBe(true)
    expect(mayProposeProjects(member(MEMBER), OFF)).toBe(false)
  })

  // The one gate here with no role bypass, and the assertion that says so: the
  // participant section reads the same for everyone, so an owner is refused the
  // participant CTA exactly as a member is. Their own create path is
  // `projects/manage/new`, gated on `mayReviewProjects` instead — asserted below
  // so this reads as the rule it is rather than a missing bypass.
  it("refuses an owner too when the capability is off", () => {
    expect(mayProposeProjects(member(OWNER), OFF)).toBe(false)
    expect(mayProposeProjects(member(OWNER), ON)).toBe(true)
  })

  it("keeps the owner's create path in the manage section either way", () => {
    expect(mayReviewProjects(member(OWNER))).toBe(true)
    expect(mayReviewProjects(undefined, true)).toBe(true)
    expect(mayReviewProjects(member(MEMBER))).toBe(false)
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
