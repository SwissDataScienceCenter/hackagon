import { describe, expect, it } from "vitest"
import {
  deadInvites,
  inviteRows,
  inviteState,
  inviteUrl,
  liveInvites,
} from "./invites"
import type { HackathonInvite } from "$lib/server/grpc/generated/hackathon/entities/hackathon_invite"

const NOW = new Date("2026-08-26T12:00:00Z")

function invite(over: Partial<HackathonInvite> = {}): HackathonInvite {
  return {
    id: "invite-1",
    token: "token-1",
    note: undefined,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    revokedAt: undefined,
    expiresAt: undefined,
    ...over,
  }
}

describe("inviteUrl", () => {
  it("builds the path the public route serves", () => {
    expect(inviteUrl("https://hackagon.example", "abc-123")).toBe(
      "https://hackagon.example/invite/abc-123",
    )
  })

  it("does not double the slash when the origin carries a trailing one", () => {
    // `event.url.origin` never has one, but a configured base URL pasted into
    // settings might, and `//invite/x` is a different path to SvelteKit.
    expect(inviteUrl("https://hackagon.example/", "abc")).toBe(
      "https://hackagon.example/invite/abc",
    )
  })
})

describe("inviteState", () => {
  it("is live with neither timestamp set", () => {
    // Reachable: CreateInvite only defaults `expires_at` to the hackathon's
    // `ends_at` when it has one, and a hackathon may have no dates.
    expect(inviteState(invite(), NOW)).toBe("live")
  })

  it("is live while the expiry is still ahead", () => {
    expect(
      inviteState(invite({ expiresAt: new Date("2026-09-09T00:00:00Z") }), NOW),
    ).toBe("live")
  })

  it("is expired once the expiry has passed", () => {
    expect(
      inviteState(invite({ expiresAt: new Date("2026-08-25T00:00:00Z") }), NOW),
    ).toBe("expired")
  })

  it("is expired at the exact millisecond of the expiry", () => {
    // The backend refuses on `expires_at.Before(now)`, so the instant itself is
    // still accepted there. Calling it expired here is the safe direction: it
    // never shows a dead link as usable.
    expect(inviteState(invite({ expiresAt: NOW }), NOW)).toBe("expired")
  })

  it("is revoked, not expired, when it is both", () => {
    // Matches the order PreviewInvite checks them in, and reports the thing
    // somebody actually did.
    expect(
      inviteState(
        invite({
          revokedAt: new Date("2026-08-02T00:00:00Z"),
          expiresAt: new Date("2026-08-25T00:00:00Z"),
        }),
        NOW,
      ),
    ).toBe("revoked")
  })

  it("is revoked even with an expiry still ahead", () => {
    expect(
      inviteState(
        invite({
          revokedAt: new Date("2026-08-02T00:00:00Z"),
          expiresAt: new Date("2026-09-09T00:00:00Z"),
        }),
        NOW,
      ),
    ).toBe("revoked")
  })
})

describe("inviteRows", () => {
  const origin = "http://localhost:8081"

  it("orders newest first, whatever order the backend returned", () => {
    // ListInvites runs a bare Query().All() with no Order, so the order on the
    // wire is arbitrary and the page has to impose one.
    const rows = inviteRows(
      [
        invite({ id: "old", createdAt: new Date("2026-08-01T00:00:00Z") }),
        invite({ id: "new", createdAt: new Date("2026-08-20T00:00:00Z") }),
        invite({ id: "mid", createdAt: new Date("2026-08-10T00:00:00Z") }),
      ],
      origin,
      NOW,
    )

    expect(rows.map((r) => r.id)).toEqual(["new", "mid", "old"])
  })

  it("breaks a tie on id, so same-millisecond invites hold still", () => {
    // The seed mints its three in one run; two can share created_at exactly.
    const same = new Date("2026-08-20T00:00:00Z")
    const rows = inviteRows(
      [
        invite({ id: "b", createdAt: same }),
        invite({ id: "a", createdAt: same }),
      ],
      origin,
      NOW,
    )

    expect(rows.map((r) => r.id)).toEqual(["a", "b"])
  })

  it("survives a missing createdAt rather than throwing on it", () => {
    // `createdAt` is `Date | undefined` in the generated type, so the sort has
    // to cope even though the handler always sets it.
    const rows = inviteRows(
      [
        invite({ id: "dated", createdAt: new Date("2026-08-20T00:00:00Z") }),
        invite({ id: "undated", createdAt: undefined }),
      ],
      origin,
      NOW,
    )

    expect(rows.map((r) => r.id)).toEqual(["dated", "undated"])
  })

  it("carries the url, the state and an empty note for a blank one", () => {
    const rows = inviteRows([invite({ token: "tok" })], origin, NOW)

    expect(rows[0]?.url).toBe("http://localhost:8081/invite/tok")
    expect(rows[0]?.state).toBe("live")
    // Empty string rather than undefined, so the template needs no fallback.
    expect(rows[0]?.note).toBe("")
  })

  it("keeps the note the organiser wrote", () => {
    const rows = inviteRows([invite({ note: "Partner list" })], origin, NOW)

    expect(rows[0]?.note).toBe("Partner list")
  })
})

describe("liveInvites / deadInvites", () => {
  const rows = inviteRows(
    [
      invite({ id: "live", createdAt: new Date("2026-08-03T00:00:00Z") }),
      invite({
        id: "revoked",
        createdAt: new Date("2026-08-02T00:00:00Z"),
        revokedAt: new Date("2026-08-05T00:00:00Z"),
      }),
      invite({
        id: "expired",
        createdAt: new Date("2026-08-01T00:00:00Z"),
        expiresAt: new Date("2026-08-10T00:00:00Z"),
      }),
    ],
    "http://localhost:8081",
    NOW,
  )

  it("splits the list into the mailable and the rest", () => {
    expect(liveInvites(rows).map((r) => r.id)).toEqual(["live"])
    expect(deadInvites(rows).map((r) => r.id)).toEqual(["revoked", "expired"])
  })

  it("partitions without dropping or duplicating a row", () => {
    expect(liveInvites(rows).length + deadInvites(rows).length).toBe(
      rows.length,
    )
  })
})
