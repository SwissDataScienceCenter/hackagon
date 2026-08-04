import { describe, it, expect, beforeAll } from "vitest"
import { createAuthorizedGrpc, requireGrpc } from "./client"
import type { AuthorizedGrpc } from "./client"
import { sharedConfigLoader } from "$lib/server/settings"

// The channel address is read from config (backend.hostname/port), so the
// clients cannot be built before it is loaded — same as on the server.
beforeAll(() => {
  sharedConfigLoader.load(process.env.TEST_CONFIG_DIR)
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
})
