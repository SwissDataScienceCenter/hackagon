import { describe, it, expect } from "vitest"
import { isProtectedRoute } from "./hooks.server"

describe("isProtectedRoute", () => {
  it("should protect /users routes", () => {
    expect(isProtectedRoute("/users")).toBe(true)
    expect(isProtectedRoute("/users/")).toBe(true)
    expect(isProtectedRoute("/users/123")).toBe(true)
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
