import { describe, it, expect } from "vitest"
import { isProtectedRoute } from "./hooks.server"

describe("isProtectedRoute", () => {
  it("should protect /manage routes", () => {
    expect(isProtectedRoute("/manage/users")).toBe(true)
    expect(isProtectedRoute("/manage/users/")).toBe(true)
    expect(isProtectedRoute("/manage/users/123")).toBe(true)
  })

  it("should protect the member hackathon view but not the public one", () => {
    expect(isProtectedRoute("/my/hackathon/abc/overview")).toBe(true)
    expect(isProtectedRoute("/my/hackathon/abc")).toBe(true)
    expect(isProtectedRoute("/hackathon/abc")).toBe(false)
    expect(isProtectedRoute("/hackathon/abc/")).toBe(false)
  })

  it("should leave an invitation link public", () => {
    // The token in the URL is the credential, and the whole point of the page is
    // that an invitee sees what they were invited to before signing in. Protect
    // this and every invitation bounces to a login wall before showing what it
    // is an invitation to — a wall the header's Log in can now return them from
    // (`safeReturnTo`), which makes it survivable rather than correct.
    expect(
      isProtectedRoute("/invite/01a03d5c-7e20-75c4-ba9c-01be44e94c70"),
    ).toBe(false)
    expect(isProtectedRoute("/invite")).toBe(false)
    expect(isProtectedRoute("/invite/")).toBe(false)
  })

  it("should not treat a route merely starting with 'invite' as public", () => {
    // `/^\/invite(\/|$)/`, not `/^\/invite/` — otherwise a future
    // `/invitees` admin page would be silently anonymous.
    expect(isProtectedRoute("/invitees")).toBe(true)
  })

  it("should protect /welcome", () => {
    expect(isProtectedRoute("/welcome")).toBe(true)
    expect(isProtectedRoute("/welcome/")).toBe(true)
  })

  it("should leave the about page public", () => {
    // Linked from AppFooter on every page, including the signed-out shell.
    expect(isProtectedRoute("/about")).toBe(false)
    expect(isProtectedRoute("/about/")).toBe(false)
  })

  it("should not treat a route merely starting with 'about' as public", () => {
    expect(isProtectedRoute("/aboutus")).toBe(true)
  })

  it("should protect unknown routes by default", () => {
    expect(isProtectedRoute("/dashboard")).toBe(true)
    expect(isProtectedRoute("/settings")).toBe(true)
    expect(isProtectedRoute("/some/new/page")).toBe(true)
  })

  it("should not protect public routes", () => {
    expect(isProtectedRoute("/")).toBe(false)
    expect(isProtectedRoute("/signin")).toBe(false)
    expect(isProtectedRoute("/signout")).toBe(false)
    expect(isProtectedRoute("/auth")).toBe(false)
    expect(isProtectedRoute("/error")).toBe(false)
  })
})
