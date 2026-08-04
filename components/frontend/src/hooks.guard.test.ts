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

  // Both live under (app). /people in particular is one letter from nothing and
  // sits next to the public /hackathon prefix, so it is worth pinning down.
  it("should protect the profile and people routes", () => {
    expect(isProtectedRoute("/profile")).toBe(true)
    expect(isProtectedRoute("/profile/")).toBe(true)
    expect(isProtectedRoute("/people/abc")).toBe(true)
    expect(isProtectedRoute("/people/abc/")).toBe(true)
  })

  it("should protect /welcome", () => {
    expect(isProtectedRoute("/welcome")).toBe(true)
    expect(isProtectedRoute("/welcome/")).toBe(true)
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
