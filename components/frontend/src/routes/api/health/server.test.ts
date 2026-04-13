import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("$lib/server/grpc/client", () => ({
  healthClient: { check: vi.fn() },
}))

import { GET } from "./+server"
import { healthClient } from "$lib/server/grpc/client"

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.mocked(healthClient.check).mockReset()
  })

  it("should return health response as JSON on success", async () => {
    vi.mocked(healthClient.check).mockImplementation((_req: any, cb: any) =>
      cb(null, { message: "healthy" }),
    )
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: "healthy" })
  })

  it("should return 500 with error message on gRPC failure", async () => {
    vi.mocked(healthClient.check).mockImplementation((_req: any, cb: any) =>
      cb(new Error("connection refused"), null),
    )
    const response = await GET()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "connection refused" })
  })
})
