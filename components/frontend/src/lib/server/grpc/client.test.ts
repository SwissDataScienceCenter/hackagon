import { describe, it, expect } from "vitest"
import { createAuthorizedGrpc, requireGrpc } from "./client"
import type { AuthorizedGrpc } from "./client"

describe("requireGrpc", () => {
  it("should return the object when defined", () => {
    const grpc = { user: {}, health: {} } as unknown as AuthorizedGrpc
    expect(requireGrpc(grpc)).toBe(grpc)
  })

  it("should throw when undefined", () => {
    expect(() => requireGrpc(undefined)).toThrow("gRPC clients not initialized")
  })
})

describe("createAuthorizedGrpc", () => {
  it("should return user and health clients", () => {
    const result = createAuthorizedGrpc("test-token-123")

    expect(result).toHaveProperty("user")
    expect(result).toHaveProperty("health")
    expect(typeof result.user.list).toBe("function")
    expect(typeof result.health.check).toBe("function")
  })

  it("should return hackathon and team clients", () => {
    const result = createAuthorizedGrpc("test-token-123")

    expect(typeof result.hackathon.get).toBe("function")
    expect(typeof result.team.list).toBe("function")
    expect(typeof result.team.listSubmissions).toBe("function")
  })
})
