import { describe, expect, it } from "vitest"
import { usableSession } from "./session"
import type { CustomSession } from "../../auth.d"

// `expires` is required on Session and irrelevant here, so it is filled in once.
function session(over: Partial<CustomSession> = {}): CustomSession {
  return {
    expires: "2099-01-01T00:00:00Z",
    user: { id: "u1" },
    accessToken: "token",
    ...over,
  } as CustomSession
}

describe("usableSession", () => {
  it("accepts a signed-in session with a live token", () => {
    expect(usableSession(session())).toBe(true)
  })

  it("rejects no session at all", () => {
    expect(usableSession(null)).toBe(false)
  })

  // The case that produced a 500 on /invite/<token>: the identity and the token
  // are both still there, and the token is dead. Auth.js says so only through
  // `error`, which is why this is the condition that gets forgotten.
  it("rejects a session whose token refresh failed", () => {
    expect(usableSession(session({ error: "RefreshTokenError" }))).toBe(false)
  })

  it("rejects any error, not just the one string", () => {
    // `error` is a plain string on the session, and auth.ts sets it in two
    // places. Matching on a specific value would let a future third one through.
    expect(usableSession(session({ error: "SomethingElse" }))).toBe(false)
  })

  it("rejects a session with no access token", () => {
    expect(usableSession(session({ accessToken: undefined }))).toBe(false)
  })

  it("rejects a session with no user", () => {
    expect(usableSession(session({ user: undefined }))).toBe(false)
  })
})
