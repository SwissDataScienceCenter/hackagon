import { describe, it, expect } from "vitest"
import { isProtectedRoute } from "./hooks.server"

describe("isProtectedRoute", () => {
  it("should protect /api/ routes by default", () => {
    expect(isProtectedRoute("/api/user")).toBe(true)
    expect(isProtectedRoute("/api/user/123")).toBe(true)
    expect(isProtectedRoute("/api/some-future-route")).toBe(true)
  })

  it("should exempt /api/health from protection", () => {
    expect(isProtectedRoute("/api/health")).toBe(false)
    expect(isProtectedRoute("/api/health/")).toBe(false)
  })

  it("should protect /welcome", () => {
    expect(isProtectedRoute("/welcome")).toBe(true)
    expect(isProtectedRoute("/welcome/")).toBe(true)
  })

  it("should not protect public routes", () => {
    expect(isProtectedRoute("/")).toBe(false)
    expect(isProtectedRoute("/signin")).toBe(false)
    expect(isProtectedRoute("/signout")).toBe(false)
    expect(isProtectedRoute("/auth")).toBe(false)
    expect(isProtectedRoute("/error")).toBe(false)
  })
})
