import { describe, it, expect } from "vitest"
import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"
import type { User } from "$lib/server/grpc/generated/user/entities/user"
import { ownerMembership, viewerMembership } from "./membership"

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
