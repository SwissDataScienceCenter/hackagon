import { beforeAll, describe, it, expect } from "vitest"
import { createAuthorizedGrpc, requireGrpc } from "./client"
import type { AuthorizedGrpc } from "./client"
import { initBackendChannel } from "./channel"

beforeAll(() => {
  initBackendChannel({
    backend: { hostname: "localhost", port: 3000 },
  })
})

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

  it("should return hackathon, team and page clients", () => {
    const result = createAuthorizedGrpc("test-token-123")

    expect(typeof result.hackathon.get).toBe("function")
    expect(typeof result.team.list).toBe("function")
    expect(typeof result.team.listSubmissions).toBe("function")
    expect(typeof result.page.list).toBe("function")
    expect(typeof result.page.get).toBe("function")
  })

  // Reads still come from `hackathon.get`; this client exists for the writes.
  it("should return a project client with the write path on it", () => {
    const result = createAuthorizedGrpc("test-token-123")

    expect(typeof result.project.propose).toBe("function")
    expect(typeof result.project.edit).toBe("function")
  })
})
