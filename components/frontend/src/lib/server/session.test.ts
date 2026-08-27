import { describe, expect, it } from "vitest"
import { clientView, usableSession } from "./session"
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

describe("clientView", () => {
  it("passes a usable session through without its access token", () => {
    const view = clientView(session())

    expect(view.session?.user?.id).toBe("u1")
    expect(view.expired).toBe(false)
    // The value crosses to the client, so this is the assertion that matters.
    expect("accessToken" in (view.session ?? {})).toBe(false)
  })

  it("reports an anonymous visitor as neither signed in nor expired", () => {
    expect(clientView(null)).toEqual({ expired: false })
  })

  // The bug this exists for: the header read `session.user` and so showed a
  // name and a Log out button on every public page for a session Keycloak had
  // already refused to refresh.
  it("hides a session whose token refresh failed, and says it expired", () => {
    const view = clientView(session({ error: "RefreshTokenError" }))

    expect(view.session).toBeUndefined()
    expect(view.expired).toBe(true)
  })

  it("treats a session caught mid-refresh as expired too", () => {
    // No access token: nothing to send, so it is not signed in — and there is
    // an identity behind it, so "expired" is the honest thing to tell the user.
    const view = clientView(session({ accessToken: undefined }))

    expect(view.session).toBeUndefined()
    expect(view.expired).toBe(true)
  })

  it("does not call a session with no user expired", () => {
    // Nobody to have expired. Anything else would put "Session expired" in
    // front of a visitor who never signed in.
    expect(clientView(session({ user: undefined }))).toEqual({ expired: false })
  })
})
