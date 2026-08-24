import { describe, it, expect } from "vitest"
import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"
import type { User } from "$lib/server/grpc/generated/user/entities/user"
import {
  ownerMembership,
  participantRowFor,
  viewerMembership,
} from "./membership"

// HackathonRole numeric values: UNSPECIFIED=0, OWNER=1, MEMBER=2.
const OWNER = 1
const MEMBER = 2

const ALICE = "user-alice"
const BOB = "user-bob"
const CREATED_AT = new Date("2026-08-01T09:00:00Z")

const user = (id: string) => ({ id }) as User

const member = (id: string, role: number, isWaiting = false) =>
  ({
    user: user(id),
    role,
    isWaiting,
    joinedAt: new Date("2026-08-05T09:00:00Z"),
  }) as HackathonMember

describe("ownerMembership", () => {
  it("reports a confirmed owner", () => {
    const m = ownerMembership(user(ALICE), CREATED_AT)

    expect(m.role).toBe(OWNER)
    expect(m.isWaiting).toBe(false)
    expect(m.joinedAt).toBe(CREATED_AT)
  })
})

describe("participantRowFor", () => {
  it("finds the viewer's own row", () => {
    const mine = member(ALICE, MEMBER)

    expect(participantRowFor([mine, member(BOB, MEMBER)], ALICE)).toBe(mine)
  })

  // The point of the helper: an owner with no participant row does not take
  // part, however confirmed `viewerMembership` makes them look.
  it("reports nothing for an owner with no participant row", () => {
    expect(participantRowFor([member(BOB, MEMBER)], ALICE)).toBeUndefined()
  })

  // An owner who joined keeps role OWNER — `GetHackathonRole` checks Owner
  // first — so the row's existence, not its role, is what says they take part.
  it("finds an owner who did join, still badged as owner", () => {
    const joined = member(ALICE, OWNER)

    expect(participantRowFor([joined], ALICE)).toBe(joined)
  })

  // Half-joined: Join wrote the row, ApproveParticipant did not clear it. The
  // row is found, and `isWaiting` is what the caller reads to say so.
  it("finds a waitlisted row rather than skipping it", () => {
    expect(
      participantRowFor([member(ALICE, OWNER, true)], ALICE)?.isWaiting,
    ).toBe(true)
  })

  it("reports nothing for a viewer with no platform user", () => {
    expect(participantRowFor([member(ALICE, OWNER)], undefined)).toBeUndefined()
  })
})

describe("viewerMembership", () => {
  it("synthesises an owner with no participant row", () => {
    const m = viewerMembership([], [user(ALICE)], ALICE, CREATED_AT)

    expect(m?.role).toBe(OWNER)
    expect(m?.isWaiting).toBe(false)
  })

  // The real row wins even for an owner: it is what the backend consults, and an
  // owner who joined and is still waiting has an isWaiting worth honouring.
  it("prefers a real participant row over the owners edge", () => {
    const waitlisted = member(ALICE, OWNER, true)

    const m = viewerMembership([waitlisted], [user(ALICE)], ALICE, CREATED_AT)

    expect(m).toBe(waitlisted)
    expect(m?.isWaiting).toBe(true)
  })

  it("leaves a plain member's row alone", () => {
    const m = viewerMembership(
      [member(BOB, MEMBER)],
      [user(ALICE)],
      BOB,
      CREATED_AT,
    )

    expect(m?.role).toBe(MEMBER)
  })

  it("reports no relationship for someone in neither collection", () => {
    expect(
      viewerMembership([member(ALICE, OWNER)], [user(ALICE)], BOB, CREATED_AT),
    ).toBeNull()
  })

  it("reports no relationship for a viewer with no platform user", () => {
    expect(
      viewerMembership(
        [member(ALICE, OWNER)],
        [user(ALICE)],
        undefined,
        CREATED_AT,
      ),
    ).toBeNull()
  })
})
